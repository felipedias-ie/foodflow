import json
import azure.functions as func
from typing import Any, Optional


def json_response(data: Any, status_code: int = 200) -> func.HttpResponse:
    return func.HttpResponse(
        body=json.dumps(data, default=str),
        status_code=status_code,
        mimetype="application/json",
        headers={
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
    )


def success_response(data: Any, status_code: int = 200) -> func.HttpResponse:
    return json_response({"success": True, "data": data}, status_code)


def error_response(message: str, status_code: int = 400, details: Optional[Any] = None) -> func.HttpResponse:
    response_data = {"success": False, "error": message}
    if details:
        response_data["details"] = details
    return json_response(response_data, status_code)

