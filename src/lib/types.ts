// Client-safe shared types (no server imports here).

export type DataStatus = "demo" | "unverified" | "verified";
export type Lang = "en" | "ml";

export interface Stop {
  id: string;
  nameEn: string;
  nameMl: string | null;
  dataStatus: DataStatus;
}

export interface Fare {
  amountInr: number;
  dataStatus: DataStatus;
  source: string | null;
  /** Set only for verified fares: when and against what a person confirmed it. */
  verifiedAt: string | null;
  verifiedSource: string | null;
}

export interface Leg {
  serviceId: string;
  verifiedAt: string | null;
  verifiedSource: string | null;
  tripId: number;
  serviceName: string;
  vehicleNumber: string | null;
  dataStatus: DataStatus;
  source: string | null;
  fromStopId: string;
  toStopId: string;
  departureMin: number;
  arrivalMin: number;
  stopsCount: number;
  fare: Fare | null;
}

export interface Journey {
  legs: Leg[]; // 1 = direct, 2 = one transfer
  transferStopId: string | null;
  waitMin: number | null;
  totalFareInr: number | null; // null if any leg has no fare
}

export interface SearchResult {
  direct: Journey[];
  transfers: Journey[];
  stops: Record<string, Stop>; // stops referenced by the journeys
}

export interface DataInfo {
  services: Record<DataStatus, number>;
  imported: { at: string; buses: number; trips: number; stops: number } | null;
}
