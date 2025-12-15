import Link from "next/link";

export default function About() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            About NeverEats
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            This is a demo Next.js application configured for static export and GitHub Pages deployment.
          </p>
          
          <div className="space-y-4 mb-8">
            <div className="border-l-4 border-indigo-500 pl-4">
              <h2 className="font-semibold text-gray-900 mb-2">Technology Stack</h2>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Next.js 15 with App Router</li>
                <li>• TypeScript</li>
                <li>• Tailwind CSS v4</li>
                <li>• Static Export (no SSR)</li>
              </ul>
            </div>
            
            <div className="border-l-4 border-green-500 pl-4">
              <h2 className="font-semibold text-gray-900 mb-2">Deployment</h2>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• GitHub Actions workflow</li>
                <li>• Automatic deployment on push</li>
                <li>• Served from GitHub Pages</li>
              </ul>
            </div>
          </div>

          <Link 
            href="/"
            className="inline-block px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

