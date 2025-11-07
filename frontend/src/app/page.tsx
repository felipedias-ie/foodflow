import { getAssetPath } from "@/lib/utils";

export default function Home() {
  return (
    <div className="bg-white relative w-full h-screen overflow-hidden">
      <div className="absolute inset-0 w-full h-full">
        <img
          alt="Hero background"
          className="absolute inset-0 w-full h-full object-cover"
          src={getAssetPath("/hero-bg.png")}
        />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-8 py-5">
        <div className="text-white text-base font-normal">
          Never <span className="font-medium">Eats</span>
        </div>
        <button className="bg-white px-4 py-2.5 rounded-full text-black text-[15px] font-normal hover:bg-gray-100 transition-colors">
          Create a restaurant
        </button>
      </nav>

      <div className="relative z-10 mx-auto max-w-[890px] mt-[200px] ml-[71px]">
        <div className="bg-[rgba(36,36,36,0.21)] backdrop-blur-sm px-6 py-5 space-y-5">
          <h1 className="text-white text-6xl font-light leading-tight">
            Order delivery near you
          </h1>

          <div className="bg-white rounded-full flex items-center pl-4 pr-2 py-2.5 gap-3 max-w-[724px]">
            <div className="flex items-center justify-center w-5 h-5 shrink-0">
              <img
                alt="Location"
                className="w-4 h-4"
                style={{ transform: 'rotate(39deg)' }}
                src={getAssetPath("/location-pin.svg")}
              />
            </div>
            <input
              type="text"
              placeholder="Enter delivery address"
              className="flex-1 min-w-0 text-[#5e5e5e] text-[15px] outline-none bg-transparent font-medium placeholder:font-medium"
            />
            <button className="bg-black text-white pl-3 pr-4 py-2 rounded-full flex items-center gap-2.5 hover:bg-gray-800 transition-colors shrink-0">
              <img
                alt="Search"
                className="w-3.5 h-3.5"
                src={getAssetPath("/search-icon.svg")}
              />
              <span className="text-[15px] font-normal whitespace-nowrap">Find Food</span>
            </button>
          </div>

          <div className="pt-2.5">
            <p className="text-white text-[15px] font-normal">Or create a restaurant →</p>
          </div>
        </div>
      </div>
    </div>
  );
}