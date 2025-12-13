export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-4">
          Awdio
        </h1>
        <p className="text-xl text-gray-400 mb-8">
          Voice-driven podcasts you can interrupt, question, and explore.
        </p>
        <div className="flex gap-4 justify-center">
          <a
            href="/admin"
            className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Admin Panel
          </a>
          <a
            href="/listen"
            className="px-6 py-3 border border-gray-600 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Listen
          </a>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl">
        <FeatureCard
          title="AI-Generated"
          description="Convert documents into engaging multi-speaker podcasts automatically."
        />
        <FeatureCard
          title="Voice-First"
          description="Interact through voice with a minimal, focused audio experience."
        />
        <FeatureCard
          title="Interruptible"
          description="Ask questions anytime and get answers from the knowledge base."
        />
      </div>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-6 border border-gray-800 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}
