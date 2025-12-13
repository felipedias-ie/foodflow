import json
import os
import re
import azure.functions as func
from azure.storage.blob import BlobServiceClient
from typing import TYPE_CHECKING, List, Optional
from shared.database import get_table_client, get_connection_string
from shared.geo import encode_geohash, geohash_neighbors, haversine_distance_meters, estimate_eta_minutes
from utils.response import success_response, error_response

if TYPE_CHECKING:
    from azure.functions import FunctionApp

TABLE_RESTAURANTS = "Restaurants"
TABLE_MENU_VERSIONS = "MenuVersions"
TABLE_CUISINE_INDEX = "CuisineIndex"
BLOB_CONTAINER_MENUS = "menus"
BLOB_CONTAINER_IMAGES = "images"


def get_blob_base_url() -> str:
    conn_str = get_connection_string()
    if "127.0.0.1" in conn_str or "localhost" in conn_str:
        return "http://127.0.0.1:10000/devstoreaccount1"
    match = re.search(r'AccountName=([^;]+)', conn_str)
    account = match.group(1) if match else "foodflowstorage"
    return f"https://{account}.blob.core.windows.net"


def is_local() -> bool:
    conn_str = get_connection_string()
    return "127.0.0.1" in conn_str or "localhost" in conn_str


def get_api_base_url() -> str:
    if is_local():
        return "http://localhost:7071/api"
    return os.environ.get("API_BASE_URL", "https://foodflow-v2.azurewebsites.net/api")


def get_image_url(image_type: str, filename: str) -> str:
    if is_local():
        return f"http://127.0.0.1:10000/devstoreaccount1/{BLOB_CONTAINER_IMAGES}/{image_type}/{filename}"
    return f"{get_api_base_url()}/images/{image_type}/{filename}"


def get_banner_url(restaurant_id: str) -> str:
    return get_image_url("banners", f"{restaurant_id}.jpg")


def get_logo_url(restaurant_id: str) -> str:
    return get_image_url("logos", f"{restaurant_id}.gif")


def query_nearby(user_lat: float, user_lon: float, limit: int = 20, precision: int = 6) -> List[dict]:
    user_hash = encode_geohash(user_lat, user_lon, precision)
    hashes = geohash_neighbors(user_hash)
    
    client = get_table_client(TABLE_RESTAURANTS)
    results = []
    
    for gh in hashes:
        try:
            entities = client.query_entities(f"PartitionKey eq '{gh}'")
            for ent in entities:
                lat = ent.get("lat")
                lon = ent.get("lon")
                if lat is None or lon is None:
                    continue
                dist = haversine_distance_meters((user_lat, user_lon), (lat, lon))
                eta_low, eta_high = estimate_eta_minutes(dist)
                rest_id = ent.get("RowKey")
                results.append({
                    "id": rest_id,
                    "name": ent.get("name"),
                    "unique_name": ent.get("unique_name"),
                    "city": ent.get("city"),
                    "address": ent.get("address_first_line"),
                    "lat": lat,
                    "lon": lon,
                    "distance_m": round(dist),
                    "eta_minutes": [eta_low, eta_high],
                    "rating_star": ent.get("rating_star"),
                    "rating_count": ent.get("rating_count"),
                    "is_delivery": ent.get("is_delivery"),
                    "is_collection": ent.get("is_collection"),
                    "logo_url": get_logo_url(rest_id),
                    "banner_url": get_banner_url(rest_id),
                    "cuisines": ent.get("cuisines"),
                })
        except Exception:
            continue
    
    results.sort(key=lambda r: r["distance_m"])
    return results[:limit]


def query_by_cuisine(cuisine: str, user_lat: Optional[float] = None, user_lon: Optional[float] = None, limit: int = 20) -> List[dict]:
    client = get_table_client(TABLE_CUISINE_INDEX)
    results = []
    
    try:
        entities = client.query_entities(f"PartitionKey eq '{cuisine.lower()}'")
        for ent in entities:
            lat = ent.get("lat")
            lon = ent.get("lon")
            dist = None
            eta = None
            if user_lat is not None and user_lon is not None and lat and lon:
                dist = haversine_distance_meters((user_lat, user_lon), (lat, lon))
                eta_low, eta_high = estimate_eta_minutes(dist)
                eta = [eta_low, eta_high]
            rest_id = ent.get("RowKey")
            results.append({
                "id": rest_id,
                "name": ent.get("name"),
                "lat": lat,
                "lon": lon,
                "distance_m": round(dist) if dist else None,
                "eta_minutes": eta,
                "rating_star": ent.get("rating_star"),
                "logo_url": get_logo_url(rest_id),
                "banner_url": get_banner_url(rest_id),
            })
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
        ent = entities[0]
        rest_id = ent.get("RowKey")
        return {
            "id": rest_id,
            "name": ent.get("name"),
            "unique_name": ent.get("unique_name"),
            "city": ent.get("city"),
            "address": ent.get("address_first_line"),
            "postal_code": ent.get("postal_code"),
            "lat": ent.get("lat"),
            "lon": ent.get("lon"),
            "rating_star": ent.get("rating_star"),
            "rating_count": ent.get("rating_count"),
            "is_delivery": ent.get("is_delivery"),
            "is_collection": ent.get("is_collection"),
            "is_open_now_delivery": ent.get("is_open_now_delivery"),
            "logo_url": get_logo_url(rest_id),
            "banner_url": get_banner_url(rest_id),
            "cuisines": ent.get("cuisines"),
            "tags": ent.get("tags"),
        }
    except Exception:
        return None


def get_menu(restaurant_id: str) -> Optional[dict]:
    try:
        conn_str = get_connection_string()
        bs = BlobServiceClient.from_connection_string(conn_str)
        blob_name = f"{restaurant_id}/current.json"
        blob_client = bs.get_blob_client(container=BLOB_CONTAINER_MENUS, blob=blob_name)
        
        data = blob_client.download_blob().readall()
        menu_data = json.loads(data.decode("utf-8"))
        
        details = menu_data.get("restaurant_details", {})
        menu_structure = menu_data.get("menu_structure", [])
        
        # Transform food image URLs to blob storage
        for category in menu_structure:
            for item in category.get("items", []):
                if item.get("image"):
                    item_id = item.get("id", "")
                    item["image"] = get_image_url("food", f"{restaurant_id}_{item_id}.jpg")
        
        return {
            "phone_number": details.get("phone_number"),
            "description": details.get("description"),
            "menu_structure": menu_structure,
        }
    except Exception:
        return None


def register_routes(app: "FunctionApp"):
    
    @app.route(route="restaurants/nearby", methods=["GET"])
    def nearby_restaurants(req: func.HttpRequest) -> func.HttpResponse:
        try:
            lat = req.params.get("lat")
            lon = req.params.get("lon")
            limit = req.params.get("limit", "20")
            
            if not lat or not lon:
                return error_response("Missing required parameters: lat and lon", 400)
            
            try:
                user_lat = float(lat)
                user_lon = float(lon)
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
            lat = req.params.get("lat")
            lon = req.params.get("lon")
            limit = req.params.get("limit", "20")
            
            if not cuisine:
                return error_response("Missing cuisine in path", 400)
            
            user_lat = float(lat) if lat else None
            user_lon = float(lon) if lon else None
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
            
            menu = get_menu(restaurant_id)
            
            if not menu:
                return error_response("Menu not found", 404)
            
            return success_response(menu)
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="images/{image_type}/{filename}", methods=["GET"])
    def serve_image(req: func.HttpRequest) -> func.HttpResponse:
        try:
            image_type = req.route_params.get("image_type")
            filename = req.route_params.get("filename")
            
            if not image_type or not filename:
                return func.HttpResponse("Not found", status_code=404)
            
            conn_str = get_connection_string()
            bs = BlobServiceClient.from_connection_string(conn_str)
            blob_path = f"{image_type}/{filename}"
            blob_client = bs.get_blob_client(container=BLOB_CONTAINER_IMAGES, blob=blob_path)
            
            data = blob_client.download_blob().readall()
            
            ext = filename.split(".")[-1].lower()
            content_type = {
                "jpg": "image/jpeg",
                "jpeg": "image/jpeg",
                "png": "image/png",
                "gif": "image/gif",
                "webp": "image/webp",
            }.get(ext, "application/octet-stream")
            
            return func.HttpResponse(
                data,
                status_code=200,
                headers={
                    "Content-Type": content_type,
                    "Cache-Control": "public, max-age=31536000",
                }
            )
        except Exception:
            return func.HttpResponse("Image not found", status_code=404)
