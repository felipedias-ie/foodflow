import azure.functions as func
from api import geocoding, management, orders, restaurants

app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)

geocoding.register_routes(app)
restaurants.register_routes(app)
management.register_routes(app)
orders.register_routes(app)