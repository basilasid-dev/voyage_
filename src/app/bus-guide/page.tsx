import type { Metadata } from "next";
import { BusFinder } from "@/components/BusFinder";
import { Header } from "@/components/Header";
import { getDataInfo, listStops } from "@/lib/db/queries";
import type { DataInfo, Stop } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kozhikode Private Bus Route Guide · Calicut Bus Guide",
  description: "Find private bus routes, stops, direct journeys and transfers across Kozhikode.",
};

export default function BusGuidePage() {
  let stops: Stop[] = [];
  let info: DataInfo = { services: { demo: 0, unverified: 0, verified: 0 }, imported: null };
  try {
    stops = listStops();
    info = getDataInfo();
  } catch (err) {
    console.error("could not load data", err);
  }

  return (
    <>
      <Header />
      <main id="main">
        <BusFinder stops={stops} info={info} />
      </main>
    </>
  );
}
