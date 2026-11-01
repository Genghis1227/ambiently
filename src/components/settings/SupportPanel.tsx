import React, { useState } from 'react';
import { Heart, ChevronDown } from 'lucide-react';

export const SupportPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-xl bg-gray-800/40 border border-gray-800 overflow-hidden transition-all hover:border-purple-500/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-gray-800/30"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-400">
            <Heart className="w-4 h-4 fill-pink-400/20" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-200 block">
              Enjoying Ambiently? Consider Supporting
            </span>
            <span className="text-[10px] text-gray-400">
              Fuel the creator & help keep this project open-source
            </span>
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-pink-400' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="p-4 pt-1 border-t border-gray-800/60 bg-gray-950/40 space-y-3 animate-in fade-in duration-150">
          <p className="text-xs text-gray-400 leading-relaxed">
            If Ambiently powers your home or command center, consider supporting future development! Scan a QR code or tap below.
          </p>

          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {/* Venmo */}
            <a
              href="https://www.venmo.com/TonyLTrinh"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center bg-gray-900 border border-gray-800 hover:border-blue-500 rounded-xl p-2.5 text-center transition-all shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1.5">
                Venmo
              </span>
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-white p-1 border border-gray-700 shadow-inner">
                <img src="/assets/venmo.png" alt="Venmo QR" className="w-full h-full object-contain" />
              </div>
              <span className="text-[11px] font-medium text-gray-300 group-hover:text-blue-400 mt-2 truncate max-w-full">
                @TonyLTrinh &rarr;
              </span>
            </a>

            {/* PayPal */}
            <a
              href="https://www.paypal.me/Genghis1227"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-center bg-gray-900 border border-gray-800 hover:border-sky-500 rounded-xl p-2.5 text-center transition-all shadow-sm"
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1.5">
                PayPal
              </span>
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-white p-1 border border-gray-700 shadow-inner">
                <img src="/assets/paypal.jpg" alt="PayPal QR" className="w-full h-full object-contain" />
              </div>
              <span className="text-[11px] font-medium text-gray-300 group-hover:text-sky-400 mt-2 truncate max-w-full">
                @Genghis1227 &rarr;
              </span>
            </a>

            {/* Zelle */}
            <div className="flex flex-col items-center bg-gray-900 border border-gray-800 rounded-xl p-2.5 text-center shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 mb-1.5">
                Zelle
              </span>
              <div className="w-16 h-16 rounded-lg overflow-hidden bg-white p-1 border border-gray-700 shadow-inner">
                <img src="/assets/zelle.jpg" alt="Zelle QR" className="w-full h-full object-contain" />
              </div>
              <span className="text-[11px] font-medium text-gray-400 mt-2">Scan in Bank App</span>
            </div>
          </div>

          <div className="pt-2 text-center border-t border-gray-800/40">
            <a
              href="https://trinhism.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-gray-400 hover:text-gray-200 transition-colors"
            >
              By <span className="text-gray-200 font-semibold underline">Trinhism Labs</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
