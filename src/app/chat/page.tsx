import { LiveMaya } from "@/components/LiveMaya";
import { siteConfig } from "@/lib/config";

export default function ChatPage() {
  return (
    <main className="chat-page">
      <header className="chat-page-head">
        <p className="eyebrow">{siteConfig.brand}</p>
        <h1>Talk with {siteConfig.personaName}</h1>
      </header>
      <LiveMaya />
    </main>
  );
}
