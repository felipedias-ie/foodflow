import json
import uuid

import azure.functions as func

from datetime           import datetime, timezone
from typing             import TYPE_CHECKING, Any, Dict, List, Optional
from azure.data.tables  import UpdateMode
from azure.storage.blob import BlobServiceClient
from api.geocoding      import address_to_coords
from shared.database    import get_connection_string, get_table_client
from shared.geo         import encode_geohash
from shared.menu        import get_menu_from_blob
from utils.response     import error_response, success_response

if TYPE_CHECKING:
    from azure.functions import FunctionApp


TABLE_RESTAURANTS = "Restaurants"
TABLE_CUISINE_INDEX = "CuisineIndex"
TABLE_MEALS = "Meals"
TABLE_MENU_VERSIONS = "MenuVersions"
TABLE_BASKETS = "Baskets"

BLOB_CONTAINER_IMAGES = "images"
BLOB_STORAGE_ACCOUNT = "ccmbg1bdc8"
BLOB_BASE_URL = f"https://{BLOB_STORAGE_ACCOUNT}.blob.core.windows.net/{BLOB_CONTAINER_IMAGES}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(val: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in (val or "").strip())
    out = "-".join([p for p in out.split("-") if p])
    return out[:80]


def _split_csv(val: Optional[str]) -> List[str]:
    if not val:
        return []
    parts = [p.strip() for p in val.split(",")]
    return [p for p in parts if p]


def _get_image_url(image_type: str, filename: str) -> str:
    return f"{BLOB_BASE_URL}/{image_type}/{filename}"


def _list_restaurants(limit: int, q: Optional[str]) -> List[Dict[str, Any]]:
    client = get_table_client(TABLE_RESTAURANTS)
    q_norm = (q or "").strip().lower()
    results: List[Dict[str, Any]] = []

    try:
        for ent in client.list_entities(results_per_page=min(limit, 100)):
            name = (ent.get("name") or "").strip()
            if q_norm and q_norm not in name.lower():
                continue
            results.append(
                {
                    "id"         : ent.get("RowKey"),
                    "name"       : name,
                    "unique_name": ent.get("unique_name"),
                    "city"       : ent.get("city"),
                    "address"    : ent.get("address_first_line"),
                    "postal_code": ent.get("postal_code"),
                    "lat"        : ent.get("lat"),
                    "lon"        : ent.get("lon"),
                    "cuisines"   : ent.get("cuisines"),
                    "tags"       : ent.get("tags"),
                }
            )
            if len(results) >= limit:
                break
    except Exception:
        return []

    results.sort(key=lambda r: (r.get("name") or "").lower())
    return results


def _upsert_cuisine_index(restaurant_id: str, cuisines_csv: Optional[str], geohash: str, lat: float, lon: float):
    cuisines = _split_csv(cuisines_csv)
    if not cuisines:
        return
    c_client = get_table_client(TABLE_CUISINE_INDEX)
    now = _now_iso()
    for cuisine in cuisines:
        c_client.upsert_entity(
            {
                "PartitionKey": cuisine.lower(),
                "RowKey"      : restaurant_id,
                "geohash"     : geohash,
                "lat"         : lat,
                "lon"         : lon,
                "updated_at"  : now,
            }
        )


def _create_restaurant(payload: Dict[str, Any]) -> Dict[str, Any]:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("Missing name")

    city        = (payload.get("city") or "").strip()
    address     = (payload.get("address") or "").strip()
    postal_code = (payload.get("postal_code") or "").strip()
    cuisines    = (payload.get("cuisines") or "").strip()
    tags        = (payload.get("tags") or "").strip()

    lat = payload.get("lat")
    lon = payload.get("lon")
    if lat is None or lon is None:
        if address:
            hits = address_to_coords(address)
            if hits and len(hits) > 0:
                lat = hits[0].latitude
                lon = hits[0].longitude
    try:
        lat = float(lat)
        lon = float(lon)
    except Exception as e:
        raise ValueError("Missing/invalid lat/lon (use map pin or address search)") from e

    rest_id  = payload.get("id") or str(uuid.uuid4())
    geohash  = encode_geohash(lat, lon, precision=6)
    now      = _now_iso()

    ent = {
        "PartitionKey"        : geohash,
        "RowKey"              : rest_id,
        "name"                : name,
        "unique_name"         : _slugify(payload.get("unique_name") or name),
        "city"                : city,
        "address_first_line"  : address,
        "postal_code"         : postal_code,
        "lat"                 : lat,
        "lon"                 : lon,
        "rating_star"         : payload.get("rating_star"),
        "rating_count"        : payload.get("rating_count"),
        "is_delivery"         : True if payload.get("is_delivery") is None else bool(payload.get("is_delivery")),
        "is_collection"        : bool(payload.get("is_collection")) if payload.get("is_collection") is not None else False,
        "is_open_now_delivery": bool(payload.get("is_open_now_delivery"))
        if payload.get("is_open_now_delivery") is not None
        else True,
        "cuisines": cuisines,
        "tags"    : tags,
        "updated_at": now,
    }

    r_client = get_table_client(TABLE_RESTAURANTS)
    r_client.upsert_entity(ent)

    _upsert_cuisine_index(rest_id, cuisines, geohash, lat, lon)

    return {
        "id"         : rest_id,
        "name"       : name,
        "unique_name": ent["unique_name"],
        "city"       : city,
        "address"    : address,
        "postal_code": postal_code,
        "lat"        : lat,
        "lon"        : lon,
        "cuisines"   : cuisines,
        "tags"       : tags,
    }


def _create_meal(restaurant_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    name = (payload.get("name") or "").strip()
    if not name:
        raise ValueError("Missing meal name")

    try:
        prep_time_minutes = int(payload.get("prep_time_minutes"))
    except Exception:
        prep_time_minutes = None

    try:
        price = float(payload.get("price"))
    except Exception as e:
        raise ValueError("Missing/invalid price") from e

    meal_id = payload.get("id") or str(uuid.uuid4())
    now     = _now_iso()

    image_type     = (payload.get("image_type") or "food").strip()
    image_filename = (payload.get("image_filename") or "").strip() or None

    ent = {
        "PartitionKey"     : restaurant_id,
        "RowKey"           : meal_id,
        "name"             : name,
        "description"      : (payload.get("description") or "").strip(),
        "prep_time_minutes": prep_time_minutes,
        "price"            : price,
        "image_type"       : image_type,
        "image_filename"   : image_filename,
        "updated_at"       : now,
    }

    client = get_table_client(TABLE_MEALS)
    client.upsert_entity(ent)

    resolved_filename = image_filename or f"{meal_id}.jpg"
    return {
        "id"               : meal_id,
        "restaurant_id"    : restaurant_id,
        "name"             : ent["name"],
        "description"      : ent["description"],
        "prep_time_minutes": ent["prep_time_minutes"],
        "price"            : ent["price"],
        "image_filename"   : resolved_filename,
        "image_url"        : _get_image_url(image_type, resolved_filename) if resolved_filename else None,
        "updated_at"       : now,
    }


def _list_meals(restaurant_id: str) -> List[Dict[str, Any]]:
    client = get_table_client(TABLE_MEALS)
    meals: List[Dict[str, Any]] = []
    try:
        entities = client.query_entities(f"PartitionKey eq '{restaurant_id}'")
        for ent in entities:
            img_type    = ent.get("image_type") or "food"
            meal_id     = ent.get("RowKey")
            img_filename = ent.get("image_filename") or f"{meal_id}.jpg"
            meals.append(
                {
                    "id"               : meal_id,
                    "restaurant_id"    : restaurant_id,
                    "name"             : ent.get("name"),
                    "description"      : ent.get("description"),
                    "prep_time_minutes": ent.get("prep_time_minutes"),
                    "price"            : ent.get("price"),
                    "image_filename"   : img_filename,
                    "image_url"        : _get_image_url(img_type, img_filename) if img_filename else None,
                    "updated_at"       : ent.get("updated_at"),
                }
            )
    except Exception:
        pass

    if meals:
        meals.sort(key=lambda m: (m.get("name") or "").lower())
        return meals

    blob_menu = get_menu_from_blob(restaurant_id)
    if not blob_menu:
        return []

    migrated_meals = []
    menu_structure = blob_menu.get("menu_structure") or []
    
    for cat in menu_structure:
        for item in cat.get("items", []):
            item_id = item.get("id")
            if not item_id:
                continue
            
            price = item.get("price")
            try:
                price = float(price)
            except Exception:
                price = 0.0
            
            payload = {
                "id"           : item_id,
                "name"         : item.get("name"),
                "description"  : item.get("description"),
                "price"        : price,
                "image_filename": f"{restaurant_id}_{item_id}.jpg" if item.get("image") else None
            }
            
            try:
                created = _create_meal(restaurant_id, payload)
                migrated_meals.append(created)
            except Exception:
                continue

    migrated_meals.sort(key=lambda m: (m.get("name") or "").lower())
    return migrated_meals


def _update_meal(restaurant_id: str, meal_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    client = get_table_client(TABLE_MEALS)
    now    = _now_iso()

    patch: Dict[str, Any] = {
        "PartitionKey": restaurant_id,
        "RowKey"      : meal_id,
        "updated_at"  : now
    }

    if "name" in payload:
        patch["name"] = (payload.get("name") or "").strip()

    if "description" in payload:
        patch["description"] = (payload.get("description") or "").strip()
    
    if "prep_time_minutes" in payload:
        try:
            patch["prep_time_minutes"] = int(payload.get("prep_time_minutes"))
        except Exception:
            patch["prep_time_minutes"] = None
    
    if "price" in payload:
        patch["price"] = float(payload.get("price"))
    
    if "image_type" in payload:
        patch["image_type"] = (payload.get("image_type") or "food").strip()
    
    if "image_filename" in payload:
        patch["image_filename"] = (payload.get("image_filename") or "").strip() or None

    client.update_entity(mode=UpdateMode.MERGE, entity=patch)

    ent         = client.get_entity(partition_key=restaurant_id, row_key=meal_id)
    img_type    = ent.get("image_type") or "food"
    img_filename = ent.get("image_filename") or f"{meal_id}.jpg"
    return {
        "id"               : meal_id,
        "restaurant_id"    : restaurant_id,
        "name"             : ent.get("name"),
        "description"      : ent.get("description"),
        "prep_time_minutes": ent.get("prep_time_minutes"),
        "price"            : ent.get("price"),
        "image_filename"   : img_filename,
        "image_url"        : _get_image_url(img_type, img_filename) if img_filename else None,
        "updated_at"       : ent.get("updated_at"),
    }


def _delete_meal(restaurant_id: str, meal_id: str):
    client = get_table_client(TABLE_MEALS)
    client.delete_entity(partition_key=restaurant_id, row_key=meal_id)


def _search_images(image_type: str, q: str, limit: int) -> List[Dict[str, str]]:
    cs = get_connection_string()
    if not cs:
        return []
    bs       = BlobServiceClient.from_connection_string(cs)
    container = bs.get_container_client(BLOB_CONTAINER_IMAGES)

    q      = (q or "").strip()
    prefix = f"{image_type}/" + (q if q else "")

    out: List[Dict[str, str]] = []
    try:
        for blob in container.list_blobs(name_starts_with=prefix):
            name = blob.name
            if not name.startswith(f"{image_type}/"):
                continue
            filename = name[len(f"{image_type}/") :]
            if not filename:
                continue
            out.append(
                {
                    "filename": filename,
                    "url"     : _get_image_url(image_type, filename),
                }
            )
            if len(out) >= limit:
                break
    except Exception:
        return []
    return out


def _search_meals(q: str, limit: int) -> List[Dict[str, Any]]:
    q_norm = (q or "").strip().lower()
    if not q_norm:
        return []

    client = get_table_client(TABLE_MEALS)
    out: List[Dict[str, Any]] = []

    try:
        for ent in client.list_entities(results_per_page=min(limit, 200)):
            name = (ent.get("name") or "").strip()
            desc = (ent.get("description") or "").strip()
            hay  = f"{name}\n{desc}".lower()
            if q_norm not in hay:
                continue

            restaurant_id = ent.get("PartitionKey")
            meal_id       = ent.get("RowKey")
            img_type      = ent.get("image_type") or "food"
            img_filename  = ent.get("image_filename") or f"{meal_id}.jpg"

            out.append(
                {
                    "id"               : meal_id,
                    "restaurant_id"    : restaurant_id,
                    "name"             : name,
                    "description"      : desc,
                    "prep_time_minutes": ent.get("prep_time_minutes"),
                    "price"            : ent.get("price"),
                    "image_filename"   : img_filename,
                    "image_url"        : _get_image_url(img_type, img_filename) if img_filename else None,
                    "updated_at"       : ent.get("updated_at"),
                }
            )
            if len(out) >= limit:
                break
    except Exception:
        return []

    out.sort(key=lambda m: (m.get("name") or "").lower())
    return out


def register_routes(app: "FunctionApp"):
    
    @app.route(route="manage/restaurants", methods=["GET", "POST"])
    def admin_restaurants(req: func.HttpRequest) -> func.HttpResponse:
        try:
            if req.method == "GET":
                limit = int(req.params.get("limit", "100"))
                q     = req.params.get("q")
                return success_response(_list_restaurants(limit=max(1, min(limit, 500)), q=q))

            payload  = req.get_json()
            created  = _create_restaurant(payload)
            return success_response(created, 201)
        except ValueError as e:
            return error_response(str(e), 400)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="manage/restaurants/{restaurant_id}/meals", methods=["GET", "POST"])
    def admin_restaurant_meals(req: func.HttpRequest) -> func.HttpResponse:
        try:
            restaurant_id = req.route_params.get("restaurant_id")
            if not restaurant_id:
                return error_response("Missing restaurant_id", 400)

            if req.method == "GET":
                return success_response(_list_meals(restaurant_id))

            payload  = req.get_json()
            created  = _create_meal(restaurant_id, payload)
            return success_response(created, 201)
        except ValueError as e:
            return error_response(str(e), 400)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="manage/restaurants/{restaurant_id}/meals/{meal_id}", methods=["PUT", "DELETE"])
    def admin_restaurant_meal(req: func.HttpRequest) -> func.HttpResponse:
        try:
            restaurant_id = req.route_params.get("restaurant_id")
            meal_id       = req.route_params.get("meal_id")
            if not restaurant_id or not meal_id:
                return error_response("Missing restaurant_id or meal_id", 400)

            if req.method == "DELETE":
                _delete_meal(restaurant_id, meal_id)
                return success_response({"deleted": True})

            payload  = req.get_json()
            updated  = _update_meal(restaurant_id, meal_id, payload)
            return success_response(updated)
        except ValueError as e:
            return error_response(str(e), 400)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="images/search", methods=["GET"])
    def image_search(req: func.HttpRequest) -> func.HttpResponse:
        try:
            image_type = (req.params.get("type") or "food").strip()
            q          = req.params.get("q", "")
            limit      = int(req.params.get("limit", "20"))
            results    = _search_images(image_type=image_type, q=q, limit=max(1, min(limit, 100)))
            return success_response(results)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="meals/search", methods=["GET"])
    def meals_search(req: func.HttpRequest) -> func.HttpResponse:
        try:
            q       = req.params.get("q", "")
            limit   = int(req.params.get("limit", "20"))
            results = _search_meals(q=q, limit=max(1, min(limit, 100)))
            return success_response(results)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
