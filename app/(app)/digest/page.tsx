import AppHeader from "@/components/AppHeader";

export default function DigestPage() {
  return (
    <>
      <AppHeader title="Digest" />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
          <p className="text-sm text-gray-400">
            Your daily digest summary will appear here once the scraping pipeline is running.
          </p>
        </div>
      </div>
    </>
  );
}
