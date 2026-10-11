import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSavedAction, updateSavedAction } from "../../actions";
import { ActionForm } from "@/components/voyage/ActionForm";
import { Card, SavedFields } from "@/components/voyage/ui";
import { getDb } from "@/lib/db/connection";
import { currentOwner } from "@/lib/voyage/owner";
import { listDestinations } from "@/lib/voyage/places";
import { getSaved, listCollections } from "@/lib/voyage/saved";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit Saved Inspiration · VOYAGE" };

export default async function EditSaved({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const owner = await currentOwner();
  const db = getDb();
  const item = owner && Number.isSafeInteger(id) ? getSaved(db, owner, id) : null;
  if (!owner || !item) notFound();

  return (
    <div className="space-y-6">
      <p>
        <Link href="/saved" className="inline-flex min-h-10 items-center text-xs font-semibold text-[#163d46] hover:underline">
          ← Back to Saved Inspiration
        </Link>
      </p>

      <div className="border-b border-[#163d46]/10 pb-4">
        <span className="text-xs font-bold uppercase tracking-widest text-[#d98772]">Inspiration Editor</span>
        <h1 className="editorial-title mt-1 text-3xl font-extrabold text-[#163d46]">
          Edit Saved Item: {item.title}
        </h1>
      </div>

      <Card>
        <ActionForm action={updateSavedAction} submitLabel="Save Changes">
          <input type="hidden" name="id" value={item.id} />
          <SavedFields destinations={listDestinations(db)} collections={listCollections(db, owner)} item={item} />
        </ActionForm>
      </Card>

      <Card>
        <h2 className="editorial-title text-lg font-bold text-red-800">Delete Item</h2>
        <p className="mt-1 text-xs text-[#566468]">
          Trips that already included this spot retain their snapshot copy. Only your saved inspiration board is affected.
        </p>
        <ActionForm
          action={deleteSavedAction}
          submitLabel="Delete This Item"
          tone="danger"
          confirmText={`Delete “${item.title}”?`}
          className="mt-3"
        >
          <input type="hidden" name="id" value={item.id} />
        </ActionForm>
      </Card>
    </div>
  );
}
