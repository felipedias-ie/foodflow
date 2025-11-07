import os
from azure.data.tables import TableServiceClient, TableClient


def get_connection_string() -> str:
    return os.environ.get("AzureWebJobsStorage", "")


def get_table_service_client() -> TableServiceClient:
    connection_string = get_connection_string()
    return TableServiceClient.from_connection_string(connection_string)


def get_table_client(table_name: str) -> TableClient:
    service_client = get_table_service_client()
    
    try:
        service_client.create_table_if_not_exists(table_name)
    except Exception:
        pass
    
    return service_client.get_table_client(table_name)