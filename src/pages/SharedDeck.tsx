import { useParams, Link } from 'react-router-dom';

export default function SharedDeck() {
  const { shareId } = useParams();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-neutral-950 text-neutral-100">
      <div className="w-full max-w-xl rounded-xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h1 className="text-xl font-semibold mb-2">Shared Deck</h1>
        <p className="text-sm opacity-80 mb-4">Share ID: <span className="font-mono">{shareId}</span></p>
        <div className="text-sm opacity-90">
          <p className="mb-3">This is a public link placeholder. A full shared deck viewer can be implemented to preview cards without signing in.</p>
          <p>
            If you have an account, you can open the app and find this deck by ID.
          </p>
        </div>
        <div className="mt-5">
          <Link className="px-3 py-2 rounded bg-primary-sky-blue text-white" to="/login">Open App</Link>
        </div>
      </div>
    </div>
  );
}
