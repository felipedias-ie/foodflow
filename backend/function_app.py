import azure.functions as func
from api import geocoding, restaurants

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

geocoding.register_routes(app)
restaurants.register_routes(app)