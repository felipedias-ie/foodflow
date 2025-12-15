import math
from typing import List, Tuple

_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"
_BASE32_MAP = {c: i for i, c in enumerate(_BASE32)}


def encode_geohash(latitude: float, longitude: float, precision: int = 6) -> str:
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    geohash      = []
    bits         = [16, 8, 4, 2, 1]
    bit          = 0
    ch           = 0
    even         = True

    while len(geohash) < precision:
        if even:
            mid = sum(lon_interval) / 2
            if longitude > mid:
                ch |= bits[bit]
                lon_interval[0] = mid
            else:
                lon_interval[1] = mid
        else:
            mid = sum(lat_interval) / 2
            if latitude > mid:
                ch |= bits[bit]
                lat_interval[0] = mid
            else:
                lat_interval[1] = mid

        even = not even
        if bit < 4:
            bit += 1
        else:
            geohash.append(_BASE32[ch])
            bit = 0
            ch = 0

    return "".join(geohash)


def haversine_distance_meters(coord_a: Tuple[float, float], coord_b: Tuple[float, float]) -> float:
    lat1, lon1 = coord_a
    lat2, lon2 = coord_b
    r          = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi       = math.radians(lat2 - lat1)
    dlambda    = math.radians(lon2 - lon1)
    
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return r * c


def estimate_eta_minutes(distance_m: float) -> Tuple[int, int]:
    prep_minutes = 10
    fast_m_per_min = 280  # ~17 km/h courier
    slow_m_per_min = 190  # ~11 km/h courier
    lower = prep_minutes + distance_m / fast_m_per_min
    upper = prep_minutes + distance_m / slow_m_per_min
    return round(lower), round(upper)


def decode_geohash(geohash: str) -> Tuple[float, float]:
    lat_interval = [-90.0, 90.0]
    lon_interval = [-180.0, 180.0]
    even         = True
    
    for c in geohash:
        cd = _BASE32_MAP[c]
        for mask in [16, 8, 4, 2, 1]:
            if even:
                if cd & mask:
                    lon_interval[0] = sum(lon_interval) / 2
                else:
                    lon_interval[1] = sum(lon_interval) / 2
            else:
                if cd & mask:
                    lat_interval[0] = sum(lat_interval) / 2
                else:
                    lat_interval[1] = sum(lat_interval) / 2
            even = not even
    
    return (sum(lat_interval) / 2, sum(lon_interval) / 2)

def geohash_neighbors(geohash: str) -> List[str]:
    lat, lon    = decode_geohash(geohash)
    precision   = len(geohash)
    lat_err     = 180.0 / (2 ** (precision * 5 // 2))
    lon_err     = 360.0 / (2 ** ((precision * 5 + 1) // 2))
    neighbors   = []
    
    for dlat in [-lat_err, 0, lat_err]:
        for dlon in [-lon_err, 0, lon_err]:
            nlat = lat + dlat
            nlon = lon + dlon
            if -90 <= nlat <= 90 and -180 <= nlon <= 180:
                neighbors.append(encode_geohash(nlat, nlon, precision))
    
    return list(set(neighbors))