export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            🍕 FoodFlow
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            A simple Next.js app deployed to GitHub Pages
          </p>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h2 className="font-semibold text-blue-900 mb-2">✓ Static Export</h2>
              <p className="text-sm text-blue-700">Built with output: &apos;export&apos;</p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <h2 className="font-semibold text-green-900 mb-2">✓ Tailwind CSS v4</h2>
              <p className="text-sm text-green-700">Using @tailwindcss/postcss</p>
            </div>
            
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <h2 className="font-semibold text-purple-900 mb-2">✓ GitHub Actions</h2>
              <p className="text-sm text-purple-700">Auto-deploy on push to main</p>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <a 
              href="/foodflow-git/about"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
            >
              About Page
            </a>
            <a 
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg font-medium hover:bg-gray-300 transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

