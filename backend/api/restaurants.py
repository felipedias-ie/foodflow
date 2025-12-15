import azure.functions as func
from azure.storage.blob import BlobServiceClient
from typing import (
    TYPE_CHECKING,
    List,
    Optional,
)
from shared.database import (
    get_table_client,
    get_connection_string,
)
from shared.geo import (
    encode_geohash,
    geohash_neighbors,
    haversine_distance_meters,
    estimate_eta_minutes,
)
from shared.menu import (
    get_menu_from_blob,
    get_image_url,
    get_banner_url,
    get_logo_url,
    BLOB_CONTAINER_IMAGES,
)
from utils.response import (
    success_response,
    error_response,
)

if TYPE_CHECKING:
    from azure.functions import FunctionApp

TABLE_RESTAURANTS   = "Restaurants"
TABLE_MENU_VERSIONS = "MenuVersions"
TABLE_CUISINE_INDEX = "CuisineIndex"

CUISINE_MAP = {
    "burgers" : "hamburguesas",
    "chinese" : "china",
    "mexican" : "mexicana",
    "indian"  : "india",
    "thai"    : "tailandesa",
    "pizza"   : "pizza",
    "sushi"   : "sushi",
    "japanese": "japonesa",
    "italian" : "italiana",
    "american": "americana",
    "spanish" : "espanola",
    "kebab"   : "kebab",
    "poke"    : "poke",
    "chicken" : "pollo",
}


def query_nearby(user_lat: float, user_lon: float, limit: int = 20, precision: int = 6) -> List[dict]:
    user_hash = encode_geohash(user_lat, user_lon, precision)
    hashes    = geohash_neighbors(user_hash)
    
    client    = get_table_client(TABLE_RESTAURANTS)
    results   = []
    
    for gh in hashes:
        try:
            entities = client.query_entities(f"PartitionKey eq '{gh}'")
            for ent in entities:
                lat = ent.get("lat")
                lon = ent.get("lon")
                
                if lat is None or lon is None:
                    continue
                
                dist              = haversine_distance_meters((user_lat, user_lon), (lat, lon))
                eta_low, eta_high = estimate_eta_minutes(dist)
                rest_id           = ent.get("RowKey")
                
                results.append({
                    "id"           : rest_id,
                    "name"         : ent.get("name"),
                    "unique_name"  : ent.get("unique_name"),
                    "city"         : ent.get("city"),
                    "address"      : ent.get("address_first_line"),
                    "lat"          : lat,
                    "lon"          : lon,
                    "distance_m"   : round(dist),
                    "eta_minutes"  : [eta_low, eta_high],
                    "rating_star"  : ent.get("rating_star"),
                    "rating_count" : ent.get("rating_count"),
                    "is_delivery"  : ent.get("is_delivery"),
                    "is_collection": ent.get("is_collection"),
                    "logo_url"     : get_logo_url(rest_id),
                    "banner_url"   : get_banner_url(rest_id),
                    "cuisines"     : ent.get("cuisines"),
                })

        except Exception:
            continue
    
    results.sort(key=lambda r: r["distance_m"])
    return results[:limit]


def query_by_cuisine(cuisine: str, user_lat: Optional[float] = None, user_lon: Optional[float] = None, limit: int = 20) -> List[dict]:
    cuisine_key = CUISINE_MAP.get(cuisine.lower(), cuisine.lower())
    
    cuisine_client = get_table_client(TABLE_CUISINE_INDEX)
    rest_client    = get_table_client(TABLE_RESTAURANTS)
    results        = []
    
    try:
        entities       = cuisine_client.query_entities(f"PartitionKey eq '{cuisine_key}'")
        restaurant_ids = [ent.get("RowKey") for ent in entities]
        
        for rest_id in restaurant_ids:
            try:
                rest_entities = list(rest_client.query_entities(f"RowKey eq '{rest_id}'"))
                if not rest_entities:
                    continue
                
                ent  = rest_entities[0]
                lat  = ent.get("lat")
                lon  = ent.get("lon")
                dist = None
                eta  = None
                
                if user_lat is not None and user_lon is not None and lat and lon:
                    dist      = haversine_distance_meters((user_lat, user_lon), (lat, lon))
                    eta_low, eta_high = estimate_eta_minutes(dist)
                    eta = [eta_low, eta_high]
                
                results.append({
                    "id"          : rest_id,
                    "name"        : ent.get("name"),
                    "unique_name" : ent.get("unique_name"),
                    "address"     : ent.get("address_first_line"),
                    "lat"         : lat,
                    "lon"         : lon,
                    "distance_m"  : round(dist) if dist else None,
                    "eta_minutes" : eta,
                    "rating_star" : ent.get("rating_star"),
                    "rating_count": ent.get("rating_count"),
                    "is_delivery" : ent.get("is_delivery"),
                    "logo_url"    : get_logo_url(rest_id),
                    "banner_url"  : get_banner_url(rest_id),
                    "cuisines"    : ent.get("cuisines"),
                })
            
            except Exception:
                continue
    
    except Exception:
        pass
    
    if user_lat is not None and user_lon is not None:
        results.sort(key=lambda r: r["distance_m"] or float("inf"))
    
    return results[:limit]


def get_restaurant_detail(restaurant_id: str) -> Optional[dict]:
    client = get_table_client(TABLE_RESTAURANTS)
    try:
        entities = list(client.query_entities(f"RowKey eq '{restaurant_id}'"))
        if not entities:
            return None
        
        ent     = entities[0]
        rest_id = ent.get("RowKey")
        
        return {
            "id"                  : rest_id,
            "name"                : ent.get("name"),
            "unique_name"         : ent.get("unique_name"),
            "city"                : ent.get("city"),
            "address"             : ent.get("address_first_line"),
            "postal_code"         : ent.get("postal_code"),
            "lat"                 : ent.get("lat"),
            "lon"                 : ent.get("lon"),
            "rating_star"         : ent.get("rating_star"),
            "rating_count"        : ent.get("rating_count"),
            "is_delivery"         : ent.get("is_delivery"),
            "is_collection"       : ent.get("is_collection"),
            "is_open_now_delivery": ent.get("is_open_now_delivery"),
            "logo_url"            : get_logo_url(rest_id),
            "banner_url"          : get_banner_url(rest_id),
            "cuisines"            : ent.get("cuisines"),
            "tags"                : ent.get("tags"),
        }
    
    except Exception:
        return None


def get_meals_menu_fallback(restaurant_id: str) -> Optional[dict]:
    client = get_table_client("Meals")
    try:
        entities = list(client.query_entities(f"PartitionKey eq '{restaurant_id}'"))
    except Exception:
        return None

    if not entities:
        return None

    menu_items = []
    for ent in entities:
        meal_id     = ent.get("RowKey")
        filename    = ent.get("image_filename") or f"{meal_id}.jpg"
        image_type  = ent.get("image_type") or "food"
        menu_items.append(
            {
                "id"         : meal_id,
                "name"       : ent.get("name"),
                "description": ent.get("description"),
                "price"      : ent.get("price"),
                "image"      : get_image_url(image_type, filename) if filename else None,
            }
        )

    menu_items.sort(key=lambda i: (i.get("name") or "").lower())
    return {
        "phone_number"  : None,
        "description"   : None,
        "menu_structure": [{"category_name": "Meals", "items": menu_items}],
    }


def register_routes(app: "FunctionApp"):
    
    @app.route(route="restaurants/search", methods=["GET"])
    def restaurants_search_text(req: func.HttpRequest) -> func.HttpResponse:
        try:
            q     = req.params.get("q", "").strip().lower()
            limit = int(req.params.get("limit", "20"))
            
            client  = get_table_client(TABLE_RESTAURANTS)
            results = []
            
            try:
                entities = client.list_entities()
                for ent in entities:
                    name     = (ent.get("name") or "").lower()
                    cuisines = (ent.get("cuisines") or "").lower()
                    
                    if not q or q in name or q in cuisines:
                        rest_id = ent.get("RowKey")
                        results.append({
                            "id"          : rest_id,
                            "name"        : ent.get("name"),
                            "unique_name" : ent.get("unique_name"),
                            "city"        : ent.get("city"),
                            "address"     : ent.get("address_first_line"),
                            "lat"         : ent.get("lat"),
                            "lon"         : ent.get("lon"),
                            "distance_m"  : 0,
                            "eta_minutes" : [20, 40],
                            "rating_star" : ent.get("rating_star"),
                            "rating_count": ent.get("rating_count"),
                            "is_delivery" : ent.get("is_delivery"),
                            "logo_url"    : get_logo_url(rest_id),
                            "banner_url"  : get_banner_url(rest_id),
                            "cuisines"    : ent.get("cuisines"),
                        })
                        if len(results) >= limit:
                            break
            except Exception:
                pass
                
            return success_response(results)
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="restaurants/nearby", methods=["GET"])
    def nearby_restaurants(req: func.HttpRequest) -> func.HttpResponse:
        try:
            lat   = req.params.get("lat")
            lon   = req.params.get("lon")
            limit = req.params.get("limit", "20")
            
            if not lat or not lon:
                return error_response("Missing required parameters: lat and lon", 400)
            
            try:
                user_lat  = float(lat)
                user_lon  = float(lon)
                limit_int = int(limit)
            except ValueError:
                return error_response("Invalid parameter format", 400)
            
            results = query_nearby(user_lat, user_lon, limit=limit_int)
            return success_response(results)
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="restaurants/cuisine/{cuisine}", methods=["GET"])
    def search_restaurants(req: func.HttpRequest) -> func.HttpResponse:
        try:
            cuisine = req.route_params.get("cuisine")
            lat     = req.params.get("lat")
            lon     = req.params.get("lon")
            limit   = req.params.get("limit", "20")
            
            if not cuisine:
                return error_response("Missing cuisine in path", 400)
            
            user_lat  = float(lat) if lat else None
            user_lon  = float(lon) if lon else None
            limit_int = int(limit)
            
            results = query_by_cuisine(cuisine, user_lat, user_lon, limit=limit_int)
            return success_response(results)
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="restaurants/{restaurant_id}", methods=["GET"])
    def restaurant_detail(req: func.HttpRequest) -> func.HttpResponse:
        try:
            restaurant_id = req.route_params.get("restaurant_id")
            
            if not restaurant_id:
                return error_response("Missing restaurant_id", 400)
            
            detail = get_restaurant_detail(restaurant_id)
            
            if not detail:
                return error_response("Restaurant not found", 404)
            
            return success_response(detail)
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="restaurants/{restaurant_id}/menu", methods=["GET"])
    def restaurant_menu(req: func.HttpRequest) -> func.HttpResponse:
        try:
            restaurant_id = req.route_params.get("restaurant_id")
            
            if not restaurant_id:
                return error_response("Missing restaurant_id", 400)
            
            menu = get_menu_from_blob(restaurant_id)
            if not menu:
                menu = get_meals_menu_fallback(restaurant_id)

            if not menu:
                return error_response("Menu not found", 404)
            
            return success_response(menu)
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="images/{image_type}/{filename}", methods=["GET"])
    def serve_image(req: func.HttpRequest) -> func.HttpResponse:
        try:
            image_type = req.route_params.get("image_type")
            filename   = req.route_params.get("filename")
            
            if not image_type or not filename:
                return func.HttpResponse("Not found", status_code=404)
            
            conn_str     = get_connection_string()
            bs           = BlobServiceClient.from_connection_string(conn_str)
            blob_path    = f"{image_type}/{filename}"
            blob_client  = bs.get_blob_client(container=BLOB_CONTAINER_IMAGES, blob=blob_path)
            
            data         = blob_client.download_blob().readall()
            
            ext          = filename.split(".")[-1].lower()
            content_type = {
                "jpg"  : "image/jpeg",
                "jpeg" : "image/jpeg",
                "png"  : "image/png",
                "gif"  : "image/gif",
                "webp" : "image/webp"}.get(ext, "application/octet-stream")
            
            return func.HttpResponse(
                data,
                status_code = 200,
                headers     = {
                    "Content-Type" : content_type,
                    "Cache-Control": "public, max-age=31536000",
                }
            )
        
        except Exception:
            return func.HttpResponse("Image not found", status_code=404)
