'use client';

import { getAssetPath } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Suggestion {
  title: string;
  address: string;
  latitude: number;
  longitude: number;
  result_type: string;
}

interface SelectedLocation {
  address: string;
  latitude: number;
  longitude: number;
}

export default function Home() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7071/api';

  useEffect(() => {
    requestUserLocation();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSuggestions]);

  const requestUserLocation = () => {
    if (!navigator.geolocation) return;

    setIsLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          const response = await fetch(
            `${API_BASE}/geocoding/reverse?lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          
          if (data.success) {
            const formattedAddress = data.data.address.road 
              ? `${data.data.address.road}, ${data.data.address.city || ''}`
              : data.data.display_name;
            
            setAddress(formattedAddress);
            setSelectedLocation({
              address: formattedAddress,
              latitude: data.data.latitude,
              longitude: data.data.longitude,
            });
            localStorage.setItem('userLocation', JSON.stringify({
              lat: data.data.latitude,
              lon: data.data.longitude,
              address: formattedAddress,
            }));
          }
        } catch (error) {
          console.error('Error fetching address:', error);
        } finally {
          setIsLoadingLocation(false);
        }
      },
      (error) => {
        console.error('Location error:', error);
        setIsLoadingLocation(false);
      }
    );
  };

  const fetchAutocomplete = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    try {
      const at = selectedLocation 
        ? `${selectedLocation.latitude},${selectedLocation.longitude}`
        : '40.42024,-3.68755';

      const response = await fetch(
        `${API_BASE}/geocoding/autocomplete?q=${encodeURIComponent(query)}&at=${at}`
      );
      const data = await response.json();
      
      if (data.success) {
        setSuggestions(data.data);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error('Autocomplete error:', error);
    }
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setSelectedLocation(null);
    
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      fetchAutocomplete(value);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    setAddress(suggestion.title);
    const location = {
      address: suggestion.address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
    };
    setSelectedLocation(location);
    localStorage.setItem('userLocation', JSON.stringify({
      lat: location.latitude,
      lon: location.longitude,
      address: location.address,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = () => {
    if (!selectedLocation) {
      alert('Please select an address from the suggestions');
      return;
    }

    const params = new URLSearchParams({
      lat: selectedLocation.latitude.toString(),
      lon: selectedLocation.longitude.toString(),
      address: selectedLocation.address,
    });
    router.push(`/search?${params.toString()}`);
  };

  return (
    <div className="bg-white relative w-full h-screen overflow-hidden">
      <div className="absolute inset-0 w-full h-full">
        <img
          alt="Hero background"
          className="absolute inset-0 w-full h-full object-cover"
          src={getAssetPath("/hero-bg.png")}
        />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="text-white text-base font-normal">
          Never <span className="font-medium">Eats</span>
        </div>
        <button
          onClick={() => router.push("/register-meal")}
          className="bg-white px-4 py-2.5 rounded-full text-black text-[15px] font-normal hover:bg-gray-100 transition-colors"
        >
          Create a restaurant
        </button>
      </nav>

      <div className="relative z-10 mx-auto max-w-[890px] mt-[200px] ml-[71px]">
        <div className="bg-[rgba(36,36,36,0.21)] backdrop-blur-sm px-6 py-5 space-y-5">
          <h1 className="text-white text-6xl font-light leading-tight">
            Order delivery near you
          </h1>

          <div className="relative max-w-[724px]" ref={dropdownRef}>
            <div className="bg-white rounded-full flex items-center pl-4 pr-2 py-2.5 gap-3">
              <div className="flex items-center justify-center w-5 h-5 shrink-0">
                {isLoadingLocation ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-black rounded-full animate-spin" />
                ) : (
                  <img
                    alt="Location"
                    className="w-4 h-4"
                    style={{ transform: 'rotate(39deg)' }}
                    src={getAssetPath("/location-pin.svg")}
                  />
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={address}
                onChange={(e) => handleAddressChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Enter delivery address"
                className="flex-1 min-w-0 text-[#5e5e5e] text-[15px] outline-none bg-transparent font-medium placeholder:font-medium"
              />
              <button 
                onClick={handleSubmit}
                className="bg-black text-white pl-3 pr-4 py-2 rounded-full flex items-center gap-2.5 hover:bg-gray-800 transition-colors shrink-0"
              >
                <img
                  alt="Search"
                  className="w-3.5 h-3.5"
                  src={getAssetPath("/search-icon.svg")}
                />
                <span className="text-[15px] font-normal whitespace-nowrap">Find Food</span>
              </button>
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg overflow-hidden z-50">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        alt="Location"
                        className="w-4 h-4 mt-1 shrink-0"
                        style={{ transform: 'rotate(39deg)' }}
                        src={getAssetPath("/location-pin.svg")}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-black truncate">
                          {suggestion.title}
                        </div>
                        <div className="text-[13px] text-gray-500 truncate">
                          {suggestion.address}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="pt-2.5">
            <p className="text-white text-[15px] font-normal">Or create a restaurant →</p>
          </div>
        </div>
      </div>
    </div>
  );
}