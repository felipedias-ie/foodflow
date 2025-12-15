import json
from typing import Optional, Dict, Any, List
from azure.storage.blob import BlobServiceClient
from shared.database import get_connection_string

BLOB_CONTAINER_MENUS    = "menus"
BLOB_CONTAINER_IMAGES   = "images"
BLOB_STORAGE_ACCOUNT    = "ccmbg1bdc8"
BLOB_BASE_URL           = f"https://{BLOB_STORAGE_ACCOUNT}.blob.core.windows.net/{BLOB_CONTAINER_IMAGES}"

def get_image_url(image_type: str, filename: str) -> str:
    return f"{BLOB_BASE_URL}/{image_type}/{filename}"

def get_banner_url(restaurant_id: str) -> str:
    return get_image_url("banners", f"{restaurant_id}.jpg")

def get_logo_url(restaurant_id: str) -> str:
    return get_image_url("logos", f"{restaurant_id}.gif")

def get_menu_from_blob(restaurant_id: str) -> Optional[Dict[str, Any]]:
    try:
        conn_str    = get_connection_string()
        bs          = BlobServiceClient.from_connection_string(conn_str)
        blob_name   = f"{restaurant_id}/current.json"
        blob_client = bs.get_blob_client(container=BLOB_CONTAINER_MENUS, blob=blob_name)
        
        data        = blob_client.download_blob().readall()
        menu_data   = json.loads(data.decode("utf-8"))
        
        details         = menu_data.get("restaurant_details", {})
        menu_structure  = menu_data.get("menu_structure", [])
        
        # transform food image urls to blob storage
        for category in menu_structure:
            for item in category.get("items", []):
                if item.get("image"):
                    item_id = item.get("id", "")
                    item["image"] = get_image_url("food", f"{restaurant_id}_{item_id}.jpg")
        
        return {
            "phone_number"  : details.get("phone_number"),
            "description"   : details.get("description"),
            "menu_structure": menu_structure,
        }
    
    except Exception:
        return None
