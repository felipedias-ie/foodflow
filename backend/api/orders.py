import json
import re
import uuid

import azure.functions as func
from azure.data.tables import UpdateMode
from datetime          import datetime, timezone
from typing            import TYPE_CHECKING, Any, Dict, List, Optional, Tuple
from api.geocoding     import get_route_details
from shared.database   import get_table_client
from shared.geo        import haversine_distance_meters, estimate_eta_minutes
from utils.response    import error_response, success_response

if TYPE_CHECKING:
    from azure.functions import FunctionApp

TABLE_ORDERS      = "Orders"
TABLE_BASKETS     = "Baskets"
TABLE_RESTAURANTS = "Restaurants"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_duration_to_seconds(duration_text: str) -> Optional[int]:
    if not duration_text:
        return None
    text          = duration_text.lower()
    total_minutes = 0

    for num, unit in re.findall(r"(\d+)\s*(h|hr|hrs|hour|hours|min|mins|minute|minutes)", text):
        n = int(num)
        if unit.startswith("h"):
            total_minutes += n * 60
        else:
            total_minutes += n

    if total_minutes <= 0:
        return None
    return total_minutes * 60


def _get_restaurant_coords(restaurant_id: str) -> Optional[Tuple[float, float]]:
    client = get_table_client(TABLE_RESTAURANTS)
    try:
        entities = list(client.query_entities(f"RowKey eq '{restaurant_id}'"))
    except Exception:
        return None
    
    if not entities:
        return None
    
    ent = entities[0]
    lat = ent.get("lat")
    lon = ent.get("lon")
    
    if lat is None or lon is None:
        return None
    
    return float(lat), float(lon)

def _compute_route(
    restaurant_coords: Tuple[float, float],
    delivery_coords: Tuple[float, float]) -> Dict[str, Any]:
    
    route = get_route_details(restaurant_coords, delivery_coords)
    if route:
        duration_text = route.duration
        seconds       = _parse_duration_to_seconds(duration_text)
        return {
            "distance_text"   : route.distance,
            "duration_text"   : route.duration,
            "duration_seconds": seconds,
            "polyline"        : route.polyline,
        }

    dist_m    = haversine_distance_meters(restaurant_coords, delivery_coords)
    low, high = estimate_eta_minutes(dist_m)
    seconds   = int(((low + high) / 2) * 60)
    
    return {
        "distance_text"   : f"{round(dist_m/1000, 1)} km",
        "duration_text"   : f"{int(seconds/60)} min",
        "duration_seconds": seconds,
        "polyline"        : "",
    }

def _basket_key(basket_id: str, restaurant_id: str) -> Dict[str, str]:
    return {
        "PartitionKey": basket_id,
        "RowKey"      : restaurant_id
    }

def register_routes(app: "FunctionApp"):
    
    @app.route(route="baskets/{basket_id}", methods=["GET", "PUT"])
    def baskets(req: func.HttpRequest) -> func.HttpResponse:
        try:
            basket_id = req.route_params.get("basket_id")
            if not basket_id:
                return error_response("Missing basket_id", 400)

            restaurant_id = req.params.get("restaurant_id") or req.params.get("rid") or "current"
            client        = get_table_client(TABLE_BASKETS)

            if req.method == "GET":
                try:
                    ent = client.get_entity(partition_key=basket_id, row_key=restaurant_id)
                except Exception:
                    return success_response(None)

                items_json = ent.get("items_json") or "[]"
                return success_response(
                    {
                        "basket_id"    : basket_id,
                        "restaurant_id": restaurant_id,
                        "items"        : json.loads(items_json),
                        "updated_at"   : ent.get("updated_at"),
                    }
                )

            payload = req.get_json()
            items   = payload.get("items") or []
            ent     = {
                **_basket_key(basket_id, restaurant_id),
                "items_json": json.dumps(items),
                "updated_at": _now_iso(),
            }

            client.upsert_entity(ent)
            return success_response({"basket_id": basket_id, "restaurant_id": restaurant_id, "saved": True})
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="orders", methods=["POST"])
    def create_order(req: func.HttpRequest) -> func.HttpResponse:
        try:
            payload   = req.get_json()
            basket_id = (payload.get("basket_id") or "").strip()
            if not basket_id:
                return error_response("Missing basket_id", 400)

            order_id = str(uuid.uuid4())

            restaurant_id = (payload.get("restaurant_id") or "").strip()
            if not restaurant_id:
                return error_response("Missing restaurant_id", 400)

            delivery = payload.get("delivery") or {}
            try:
                delivery_lat = float(delivery.get("lat"))
                delivery_lon = float(delivery.get("lon"))
            except Exception:
                return error_response("Missing/invalid delivery lat/lon", 400)

            delivery_address = (delivery.get("address") or "").strip()

            items = payload.get("items") or []
            if not isinstance(items, list) or len(items) == 0:
                return error_response("Missing items", 400)

            subtotal         = 0.0
            normalized_items: List[Dict[str, Any]] = []
            for it in items:
                try:
                    price = float(it.get("price"))
                    qty   = int(it.get("quantity", 1))
                    if qty < 1:
                        continue
                    subtotal += price * qty
                    normalized_items.append(
                        {
                            "id"         : it.get("id"),
                            "name"       : it.get("name"),
                            "price"      : price,
                            "quantity"   : qty,
                            "image"      : it.get("image"),
                            "description": it.get("description"),
                        }
                    )
                except Exception:
                    continue

            if not normalized_items:
                return error_response("No valid items", 400)

            delivery_fee = float(payload.get("delivery_fee", 2.99))
            total        = round(subtotal + delivery_fee, 2)

            rest_coords = _get_restaurant_coords(restaurant_id)
            if not rest_coords:
                return error_response("Restaurant not found", 404)

            route = _compute_route(rest_coords, (delivery_lat, delivery_lon))

            now = _now_iso()
            ent = {
                "PartitionKey"           : "order",
                "RowKey"                 : order_id,
                "basket_id"              : basket_id,
                "restaurant_id"          : restaurant_id,
                "status"                 : "PLACED",
                "created_at"             : now,
                "updated_at"             : now,
                "delivery_address"       : delivery_address,
                "delivery_lat"           : delivery_lat,
                "delivery_lon"           : delivery_lon,
                "restaurant_lat"         : rest_coords[0],
                "restaurant_lon"         : rest_coords[1],
                "items_json"             : json.dumps(normalized_items),
                "subtotal"               : round(subtotal, 2),
                "delivery_fee"           : delivery_fee,
                "total"                  : total,
                "route_distance_text"    : route.get("distance_text"),
                "route_duration_text"    : route.get("duration_text"),
                "route_duration_seconds" : route.get("duration_seconds"),
                "route_polyline"         : route.get("polyline"),
                "eta_updated_at"         : now,
            }

            client = get_table_client(TABLE_ORDERS)
            client.upsert_entity(ent)

            return success_response(
                {
                    "id"           : order_id,
                    "status"       : ent["status"],
                    "created_at"   : now,
                    "basket_id"    : basket_id,
                    "restaurant_id": restaurant_id,
                    "delivery"     : {
                        "lat"    : delivery_lat,
                        "lon"    : delivery_lon,
                        "address": delivery_address
                    },
                    "items"      : normalized_items,
                    "subtotal"   : ent["subtotal"],
                    "delivery_fee": delivery_fee,
                    "total"      : total,
                    "route"      : {
                        "distance"        : ent.get("route_distance_text"),
                        "duration"        : ent.get("route_duration_text"),
                        "duration_seconds": ent.get("route_duration_seconds"),
                        "polyline"        : ent.get("route_polyline"),
                    },
                },
                201,
            )
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="orders/{order_id}", methods=["GET"])
    def get_order(req: func.HttpRequest) -> func.HttpResponse:
        try:
            order_id = req.route_params.get("order_id")
            if not order_id:
                return error_response("Missing order_id", 400)

            client = get_table_client(TABLE_ORDERS)
            try:
                ent = client.get_entity(partition_key="order", row_key=order_id)
            except Exception:
                return error_response("Order not found", 404)

            items = json.loads(ent.get("items_json") or "[]")
            return success_response(
                {
                    "id"         : order_id,
                    "status"     : ent.get("status"),
                    "created_at" : ent.get("created_at"),
                    "updated_at" : ent.get("updated_at"),
                    "basket_id"  : ent.get("basket_id"),
                    "restaurant_id": ent.get("restaurant_id"),
                    "restaurant" : {
                        "lat": ent.get("restaurant_lat"),
                        "lon": ent.get("restaurant_lon")
                    },
                    "delivery"   : {
                        "lat"    : ent.get("delivery_lat"),
                        "lon"    : ent.get("delivery_lon"),
                        "address": ent.get("delivery_address"),
                    },
                    "items"      : items,
                    "subtotal"   : ent.get("subtotal"),
                    "delivery_fee": ent.get("delivery_fee"),
                    "total"      : ent.get("total"),
                    "route"      : {
                        "distance"        : ent.get("route_distance_text"),
                        "duration"        : ent.get("route_duration_text"),
                        "duration_seconds": ent.get("route_duration_seconds"),
                        "polyline"        : ent.get("route_polyline"),
                        "eta_updated_at"  : ent.get("eta_updated_at"),
                    },
                }
            )
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="orders/{order_id}/status", methods=["PUT"])
    def update_order_status(req: func.HttpRequest) -> func.HttpResponse:
        try:
            order_id = req.route_params.get("order_id")
            if not order_id:
                return error_response("Missing order_id", 400)

            payload = req.get_json()
            status  = (payload.get("status") or "").strip().upper()
            if not status:
                return error_response("Missing status", 400)

            client = get_table_client(TABLE_ORDERS)
            patch  = {
                "PartitionKey": "order",
                "RowKey"      : order_id,
                "status"      : status,
                "updated_at"  : _now_iso()
            }
            client.update_entity(mode=UpdateMode.MERGE, entity=patch)
            return success_response({"id": order_id, "status": status})
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="orders/{order_id}/refresh-eta", methods=["POST"])
    def refresh_eta(req: func.HttpRequest) -> func.HttpResponse:
        try:
            order_id = req.route_params.get("order_id")
            if not order_id:
                return error_response("Missing order_id", 400)

            client = get_table_client(TABLE_ORDERS)
            try:
                ent = client.get_entity(partition_key="order", row_key=order_id)
            except Exception:
                return error_response("Order not found", 404)

            rest_coords    = (float(ent.get("restaurant_lat")), float(ent.get("restaurant_lon")))
            delivery_coords = (float(ent.get("delivery_lat")), float(ent.get("delivery_lon")))
            route          = _compute_route(rest_coords, delivery_coords)
            now            = _now_iso()

            patch = {
                "PartitionKey"          : "order",
                "RowKey"                : order_id,
                "route_distance_text"   : route.get("distance_text"),
                "route_duration_text"    : route.get("duration_text"),
                "route_duration_seconds": route.get("duration_seconds"),
                "route_polyline"        : route.get("polyline"),
                "eta_updated_at"        : now,
                "updated_at"            : now,
            }
            client.update_entity(mode=UpdateMode.MERGE, entity=patch)
            return success_response(
                {
                    "id": order_id,
                    "route": {
                        "distance"        : patch.get("route_distance_text"),
                        "duration"        : patch.get("route_duration_text"),
                        "duration_seconds": patch.get("route_duration_seconds"),
                        "polyline"        : patch.get("route_polyline"),
                        "eta_updated_at"  : now,
                    },
                }
            )
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
