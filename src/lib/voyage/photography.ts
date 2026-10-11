// Remote Unsplash photos (hotlinked, not bundled). Their URLs were checked to return an image, but nobody has confirmed
// that every photo shows exactly the named place, so treat them as atmosphere. Any photo that fails to load, or a place
// with no entry here, shows the local SVG illustration instead (see SmartImage).

export interface PhotoAsset {
  src: string;
  alt: string;
  caption?: string;
  credit?: string;
}

export const DESTINATION_PHOTOS: Record<string, PhotoAsset> = {
  kozhikode: {
    src: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1600&q=80",
    alt: "Warm sunset glow over Kerala coastal palms and tranquil backwaters",
    caption: "Malabar Coast sunset with golden light over coconut groves",
    credit: "Unsplash",
  },
  istanbul: {
    src: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1600&q=80",
    alt: "Golden hour view across the Bosphorus strait toward historic Istanbul domes",
    caption: "Golden light casting silhouettes over the minarets and waters of the Bosphorus",
    credit: "Unsplash",
  },
};

export const PLACE_PHOTOS: Record<string, PhotoAsset> = {
  // Kozhikode Places
  "kozhikode-beach": {
    src: "https://images.unsplash.com/photo-1590523741831-ab7e8b8f9c7f?auto=format&fit=crop&w=1000&q=80",
    alt: "Wide shoreline of Kozhikode beach beside the rolling waves of the Arabian Sea at dusk",
    caption: "Seafront promenade where locals gather for sunset walks and sea breeze",
  },
  "mananchira-square": {
    src: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?auto=format&fit=crop&w=1000&q=80",
    alt: "Calm water pond surrounded by emerald lawns and historic trees in a city center",
    caption: "Heritage square centered around the historic Mananchira water tank",
  },
  "mishkal-mosque": {
    src: "https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1000&q=80",
    alt: "Traditional multi-tiered Kerala wooden architecture in heritage Kuttichira",
    caption: "Centuries-old wooden craftsmanship in the historic Kuttichira quarter",
  },
  "kappad-beach": {
    src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1000&q=80",
    alt: "Rocky seaside headland and coastal waters at Kappad",
    caption: "Historic landing beach north of Kozhikode with rocky coastline",
  },
  "beypore-port": {
    src: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1000&q=80",
    alt: "Traditional wooden marine vessel and harbor pier",
    caption: "Centuries of shipbuilding heritage along the Chaliyar river mouth",
  },
  "thusharagiri-falls": {
    src: "https://images.unsplash.com/photo-1432405972618-c60b0225b8f9?auto=format&fit=crop&w=1000&q=80",
    alt: "Lush tropical waterfall tumbling over granite rocks in dense Western Ghats forest",
    caption: "Mist-covered waterfalls surrounded by rubber and spice plantations",
  },
  "paragon-restaurant": {
    src: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=1000&q=80",
    alt: "Fragrant spiced Malabar biryani served with garnishes",
    caption: "Legendary Malabar biryani with aromatic kaima rice and spices",
  },
  "sm-street": {
    src: "https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=1000&q=80",
    alt: "Traditional confectionery and sweet market stalls",
    caption: "Sweet Meat Street (Mittai Theruvu) known for banana chips and freshly set Kozhikode halwa",
  },
  "beach-food-stalls": {
    src: "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1000&q=80",
    alt: "Bustling evening beachside food cart with warm incandescent lights",
    caption: "Evening seafront stalls frying pickled fruit snacks and Malabar coastal treats",
  },

  // Istanbul Places
  "hagia-sophia": {
    src: "https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?auto=format&fit=crop&w=1000&q=80",
    alt: "Massive Byzantine dome and soaring minarets of Hagia Sophia against evening sky",
    caption: "Iconic sixth-century architectural masterpiece overlooking Sultanahmet square",
  },
  "blue-mosque": {
    src: "https://images.unsplash.com/photo-1545459720-aac8509eb02c?auto=format&fit=crop&w=1000&q=80",
    alt: "Cascading domes and six slender minarets of Sultanahmet Mosque",
    caption: "Seventeenth-century landmark adorned with thousands of blue İznik ceramic tiles",
  },
  "topkapi-palace": {
    src: "https://images.unsplash.com/photo-1570939274717-7eda259b50ed?auto=format&fit=crop&w=1000&q=80",
    alt: "Historic stone archways and imperial courtyards overlooking the Bosphorus",
    caption: "Imperial seat of Ottoman sultans with sweeping views of the Sea of Marmara",
  },
  // galata-tower: the previous photo URL no longer exists (404), so the local illustration is shown.
  "grand-bazaar": {
    src: "https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1000&q=80",
    alt: "Vaulted arcades hung with glowing mosaic glass lamps in the Grand Bazaar",
    caption: "Over four thousand shops under vaulted Ottoman arcades",
  },
  "karakoy-gulluoglu": {
    src: "https://images.unsplash.com/photo-1519676867240-f03562e64548?auto=format&fit=crop&w=1000&q=80",
    alt: "Diamond-cut layers of golden crispy baklava generously sprinkled with green pistachios",
    caption: "Artisanal baklava masterfully layered with Gaziantep pistachios and light syrup",
  },
  "ciya-sofrasi": {
    src: "https://images.unsplash.com/photo-1541518763669-27fef04b14ea?auto=format&fit=crop&w=1000&q=80",
    alt: "Colorful assortment of Anatolian meze dishes on a restaurant table",
    caption: "Anatolian culinary heritage brought to life across the ferry in Kadıköy",
  },
  "balik-ekmek-eminonu": {
    src: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=1000&q=80",
    alt: "Fresh grilled fish fillets served in crusty bread with lemon and onions by the water",
    caption: "Classic street meal prepared on rocking boats beside the Galata Bridge",
  },
};

/** Returns photographic asset if available, otherwise returns null */
export function getPlacePhoto(placeId: string): PhotoAsset | null {
  return PLACE_PHOTOS[placeId] ?? null;
}

export function getDestinationPhoto(destinationId: string): PhotoAsset | null {
  return DESTINATION_PHOTOS[destinationId] ?? null;
}
