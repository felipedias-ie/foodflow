from typing import Optional, List
from pydantic import BaseModel


class Address(BaseModel):
    road           : Optional[str] = None
    house_number   : Optional[str] = None
    neighbourhood  : Optional[str] = None
    suburb         : Optional[str] = None
    city           : Optional[str] = None
    state          : Optional[str] = None
    postcode       : Optional[str] = None
    country        : Optional[str] = None
    country_code   : Optional[str] = None
    
    def formatted(self) -> str:
        parts = []
        
        if self.road:
            street = self.road
            if self.house_number:
                street = f"{self.house_number} {street}"
            parts.append(street)
        
        if self.city:
            parts.append(self.city)
        
        if self.state:
            parts.append(self.state)
        
        if self.postcode:
            parts.append(self.postcode)
        
        if self.country:
            parts.append(self.country)
        
        return ", ".join(parts)


class Location(BaseModel):
    latitude       : float
    longitude      : float
    address        : Address
    display_name   : str


class AutocompleteSuggestion(BaseModel):
    title          : str
    address        : str
    latitude       : float
    longitude      : float
    result_type    : str
    distance       : Optional[int] = None


class RouteStep(BaseModel):
    instruction    : str
    distance       : str
    duration       : str
    maneuver       : Optional[str] = None


class RouteDetails(BaseModel):
    distance       : str
    duration       : str
    start_address  : str
    end_address    : str
    steps          : List[RouteStep]
    polyline       : str

