import requests
import hashlib
import base64
import azure.functions as func

from typing         import TYPE_CHECKING, Optional, List
from shared.models  import Location, Address, AutocompleteSuggestion, RouteDetails, RouteStep
from utils.response import success_response, error_response

if TYPE_CHECKING:
    from azure.functions import FunctionApp

def coords_to_address(latitude: float, longitude: float) -> Optional[Location]:
    url = "https://nominatim.openstreetmap.org/reverse"
    
    params = {
        "lat"    : latitude,
        "lon"    : longitude,
        "format" : "json",
    }
    
    headers = {
        "User-Agent": "FoodFlow/1.0"
    }
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if "error" in data:
            return None
        
        return Location(
            latitude     = float(data["lat"]),
            longitude    = float(data["lon"]),
            address      = Address(**data.get("address", {})),
            display_name = data.get("display_name", "")
        )
    
    except Exception:
        return None


def address_to_coords(query: str) -> Optional[List[Location]]:
    url = "https://nominatim.openstreetmap.org/search"
    
    params = {
        "q"      : query,
        "format" : "json",
        "limit"  : 5,
        "addressdetails": 1,
    }
    
    headers = {
        "User-Agent": "FoodFlow/1.0"
    }
    
    try:
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if not data:
            return None
        
        locations = []
        for item in data:
            location = Location(
                latitude     = float(item["lat"]),
                longitude    = float(item["lon"]),
                address      = Address(**item.get("address", {})),
                display_name = item.get("display_name", "")
            )
            locations.append(location)
        
        return locations
    
    except Exception:
        return None


def autocomplete_address(query: str, at: str = "40.42024,-3.68755") -> Optional[List[AutocompleteSuggestion]]:
    headers = {
        'Accept': 'application/json',
        'Accept-Language': 'en,fr-FR;q=0.9,fr;q=0.8,es-ES;q=0.7,es;q=0.6,en-US;q=0.5,am;q=0.4,de;q=0.3',
        'Connection': 'keep-alive',
        'Origin': 'https://wego.here.com',
        'Referer': 'https://wego.here.com/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
    }

    params = {
        'xnlp': 'CL_JSMv3.2.0.0',
        'apikey': 't8O_G9BE_xgA_oPNGdUOXmxdRrQjbCqOr7YsXIywQsU',
        'at': at,
        'lang': 'en-GB',
        'limit': '5',
        'q': query,
    }

    try:
        response = requests.get('https://autosuggest.search.hereapi.com/v1/autosuggest', 
            params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get('items'):
            return None
        
        suggestions = []
        for item in data['items']:
            suggestion = AutocompleteSuggestion(
                title       = item.get('title', ''),
                address     = item.get('address', {}).get('label', ''),
                latitude    = item.get('position', {}).get('lat', 0.0),
                longitude   = item.get('position', {}).get('lng', 0.0),
                result_type = item.get('resultType', ''),
                distance    = item.get('distance')
            )
            suggestions.append(suggestion)
        
        return suggestions
    
    except Exception:
        return None


def x_browser_validation(useragent: str) -> str:
    key = 'AIzaSyDr2UxVnv_U85AbhhY8XSHSIavUW0DC-sY'
    return base64.b64encode(hashlib.sha1(f'{key}{useragent}'.encode()).digest()).decode()


def get_route_details(coords_from: tuple[float, float], coords_to: tuple[float, float]) -> Optional[RouteDetails]:
    user_agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    
    headers = {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'origin': 'https://developers-dot-devsite-v2-prod.appspot.com',
        'pragma': 'no-cache',
        'priority': 'u=1, i',
        'referer': 'https://developers-dot-devsite-v2-prod.appspot.com/',
        'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': user_agent,
        'x-browser-channel': 'stable',
        'x-browser-copyright': 'Copyright 2025 Google LLC. All rights reserved.',
        'x-browser-validation': x_browser_validation(user_agent),
        'x-browser-year': '2025',
        'x-goog-api-key': 'AIzaSyAOWd855Jru-vGD_bVJqc6Qr-n8VpX0XsA',
        'x-goog-fieldmask': '*',
    }

    json_data = {
        'origin': {
            'vehicleStopover': False,
            'sideOfRoad': False,
            'location': {
                'latLng': {
                    'latitude': str(coords_from[0]),
                    'longitude': str(coords_from[1]),
                },
            },
        },
        'destination': {
            'vehicleStopover': False,
            'sideOfRoad': False,
            'location': {
                'latLng': {
                    'latitude': str(coords_to[0]),
                    'longitude': str(coords_to[1]),
                },
            },
        },
        'travelMode': 'drive',
        'routingPreference': 'traffic_aware_optimal',
        'polylineQuality': 'high_quality',
        'computeAlternativeRoutes': False,
        'routeModifiers': {
            'avoidTolls': False,
            'avoidHighways': False,
            'avoidFerries': False,
            'avoidIndoor': False,
        },
        'extraComputations': [
            'TRAFFIC_ON_POLYLINE',
        ],
    }

    try:
        response = requests.post('https://routes.googleapis.com/directions/v2:computeRoutes', 
            headers=headers, json=json_data, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        
        if not data.get('routes'):
            return None
        
        route = data['routes'][0]
        leg   = route['legs'][0]
        
        steps = []
        for step in leg.get('steps', []):
            route_step = RouteStep(
                instruction = step.get('navigationInstruction', {}).get('instructions', ''),
                distance    = step.get('localizedValues', {}).get('distance', {}).get('text', ''),
                duration    = step.get('localizedValues', {}).get('staticDuration', {}).get('text', ''),
                maneuver    = step.get('navigationInstruction', {}).get('maneuver')
            )
            steps.append(route_step)
        
        route_details = RouteDetails(
            distance      = route.get('localizedValues', {}).get('distance', {}).get('text', ''),
            duration      = route.get('localizedValues', {}).get('duration', {}).get('text', ''),
            start_address = f"{coords_from[0]}, {coords_from[1]}",
            end_address   = f"{coords_to[0]}, {coords_to[1]}",
            steps         = steps,
            polyline      = route.get('polyline', {}).get('encodedPolyline', '')
        )
        
        return route_details
    
    except Exception:
        return None


def register_routes(app: 'FunctionApp'):
    
    @app.route(route="geocoding/reverse", methods=["GET"])
    def reverse_geocode(req: func.HttpRequest) -> func.HttpResponse:
        try:
            lat = req.params.get("lat")
            lon = req.params.get("lon")
            
            if not lat or not lon:
                return error_response("Missing required parameters: lat and lon", 400)
            
            try:
                latitude  = float(lat)
                longitude = float(lon)
            except ValueError:
                return error_response("Invalid latitude or longitude format", 400)
            
            location = coords_to_address(latitude, longitude)
            
            if not location:
                return error_response("Could not find address for coordinates", 404)
            
            return success_response(location.model_dump())
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="geocoding/search", methods=["GET"])
    def forward_geocode(req: func.HttpRequest) -> func.HttpResponse:
        try:
            query = req.params.get("q")
            
            if not query:
                return error_response("Missing required parameter: q", 400)
            
            locations = address_to_coords(query)
            
            if not locations:
                return error_response("No results found for query", 404)
            
            return success_response([loc.model_dump() for loc in locations])
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="geocoding/autocomplete", methods=["GET"])
    def autocomplete(req: func.HttpRequest) -> func.HttpResponse:
        try:
            query = req.params.get("q")
            at    = req.params.get("at", "40.42024,-3.68755")
            
            if not query:
                return error_response("Missing required parameter: q", 400)
            
            suggestions = autocomplete_address(query, at)
            
            if not suggestions:
                return error_response("No suggestions found", 404)
            
            return success_response([s.model_dump() for s in suggestions])
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
    
    @app.route(route="geocoding/route", methods=["GET"])
    def route_directions(req: func.HttpRequest) -> func.HttpResponse:
        try:
            from_lat = req.params.get("from_lat")
            from_lon = req.params.get("from_lon")
            to_lat   = req.params.get("to_lat")
            to_lon   = req.params.get("to_lon")
            
            if not all([from_lat, from_lon, to_lat, to_lon]):
                return error_response("Missing required parameters: from_lat, from_lon, to_lat, to_lon", 400)
            
            try:
                coords_from = (float(from_lat), float(from_lon))
                coords_to   = (float(to_lat), float(to_lon))
            except ValueError:
                return error_response("Invalid coordinate format", 400)
            
            route = get_route_details(coords_from, coords_to)
            
            if not route:
                return error_response("Could not calculate route", 404)
            
            return success_response(route.model_dump())
        
        except Exception as e:
            return error_response(f"Internal server error: {str(e)}", 500)
