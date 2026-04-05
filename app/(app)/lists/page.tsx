"use client";

import { useEffect, useState, useCallback } from "react";
import AppHeader from "@/components/AppHeader";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface List {
  id: string;
  name: string;
  emoji: string;
}

interface ListItem {
  id: string;
  list_id: string;
  text: string;
  checked: boolean;
}

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [items, setItems] = useState<Record<string, ListItem[]>>({});
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newItemText, setNewItemText] = useState("");
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListEmoji, setNewListEmoji] = useState("");
  const [loading, setLoading] = useState(true);

  const supabase = createBrowserSupabaseClient();

  const fetchLists = useCallback(async () => {
    const { data } = await supabase
      .from("lists")
      .select("*")
      .order("created_at", { ascending: true });
    setLists(data ?? []);
    if (data && data.length > 0 && !activeListId) {
      setActiveListId(data[0].id);
    }
    setLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchItems = useCallback(async (listId: string) => {
    const { data } = await supabase
      .from("list_items")
      .select("*")
      .eq("list_id", listId)
      .order("checked", { ascending: true })
      .order("created_at", { ascending: false });
    setItems((prev) => ({ ...prev, [listId]: data ?? [] }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  useEffect(() => {
    if (activeListId) fetchItems(activeListId);
  }, [activeListId, fetchItems]);

  // Real-time subscription for list items
  useEffect(() => {
    if (!activeListId) return;
    const channel = supabase
      .channel(`list-items-${activeListId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "list_items",
          filter: `list_id=eq.${activeListId}`,
        },
        () => {
          fetchItems(activeListId);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeListId, fetchItems, supabase]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItemText.trim() || !activeListId) return;

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("list_items").insert({
      list_id: activeListId,
      text: newItemText.trim(),
      added_by: user?.id ?? null,
    });
    setNewItemText("");
    fetchItems(activeListId);
  }

  async function toggleItem(item: ListItem) {
    await supabase
      .from("list_items")
      .update({ checked: !item.checked })
      .eq("id", item.id);
    fetchItems(item.list_id);
  }

  async function deleteItem(item: ListItem) {
    await supabase.from("list_items").delete().eq("id", item.id);
    fetchItems(item.list_id);
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;

    const { data } = await supabase
      .from("lists")
      .insert({
        name: newListName.trim(),
        emoji: newListEmoji.trim() || null,
        household_id: (
          await supabase
            .from("profiles")
            .select("household_id")
            .single()
        ).data?.household_id,
      })
      .select("id")
      .single();

    setNewListName("");
    setNewListEmoji("");
    setShowNewList(false);
    await fetchLists();
    if (data) setActiveListId(data.id);
  }

  const activeItems = activeListId ? items[activeListId] ?? [] : [];
  const unchecked = activeItems.filter((i) => !i.checked);
  const checked = activeItems.filter((i) => i.checked);

  return (
    <>
      <AppHeader title="Lists" />
      <div className="px-4 py-4">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            {/* List tabs */}
            <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
              {lists.map((list) => (
                <button
                  key={list.id}
                  onClick={() => setActiveListId(list.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    activeListId === list.id
                      ? "bg-amber-500 text-white"
                      : "bg-gray-100 text-gray-600 active:bg-gray-200"
                  }`}
                >
                  {list.emoji ? `${list.emoji} ` : ""}{list.name}
                </button>
              ))}
              <button
                onClick={() => setShowNewList(true)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </button>
            </div>

            {/* New list form */}
            {showNewList && (
              <form onSubmit={createList} className="mb-4 rounded-xl border border-gray-200 bg-white p-3">
                <p className="mb-2 text-sm font-medium text-gray-700">New list</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newListEmoji}
                    onChange={(e) => setNewListEmoji(e.target.value)}
                    placeholder="Emoji"
                    className="w-14 rounded-lg border border-gray-200 px-2 py-2 text-center text-sm focus:border-amber-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="List name"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-white active:bg-amber-600"
                  >
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewList(false)}
                    className="rounded-lg px-4 py-2 text-sm text-gray-500 active:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* No lists state */}
            {lists.length === 0 && !showNewList && (
              <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                <p className="mb-2 text-sm text-gray-400">No lists yet</p>
                <button
                  onClick={() => setShowNewList(true)}
                  className="text-sm font-medium text-amber-600"
                >
                  Create your first list
                </button>
              </div>
            )}

            {/* Active list items */}
            {activeListId && (
              <>
                {/* Add item */}
                <form onSubmit={addItem} className="mb-3 flex gap-2">
                  <input
                    type="text"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    placeholder="Add an item..."
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm focus:border-amber-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!newItemText.trim()}
                    className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-medium text-white disabled:opacity-40 active:bg-amber-600"
                  >
                    Add
                  </button>
                </form>

                {/* Unchecked items */}
                {unchecked.length === 0 && checked.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
                    <p className="text-sm text-gray-400">This list is empty</p>
                  </div>
                )}

                <div className="space-y-1">
                  {unchecked.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl bg-white px-3 py-3 border border-gray-200"
                    >
                      <button
                        onClick={() => toggleItem(item)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-gray-300"
                      />
                      <span className="flex-1 text-sm text-gray-900">{item.text}</span>
                      <button
                        onClick={() => deleteItem(item)}
                        className="shrink-0 p-1 text-gray-300 active:text-red-400"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Checked items */}
                {checked.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-xs font-medium uppercase text-gray-400">
                      Done ({checked.length})
                    </p>
                    <div className="space-y-1">
                      {checked.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 border border-gray-100"
                        >
                          <button
                            onClick={() => toggleItem(item)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-amber-400 bg-amber-400"
                          >
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          </button>
                          <span className="flex-1 text-sm text-gray-400 line-through">{item.text}</span>
                          <button
                            onClick={() => deleteItem(item)}
                            className="shrink-0 p-1 text-gray-300 active:text-red-400"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
