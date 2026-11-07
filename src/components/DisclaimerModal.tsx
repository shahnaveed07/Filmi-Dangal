import React from 'react';
import { X, ShieldAlert, Award } from 'lucide-react';
import { AudioManager } from '../engine/AudioManager';

interface DisclaimerModalProps {
  onClose: () => void;
}

export const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
  const audio = AudioManager.getInstance();

  return (
    <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 select-none overflow-y-auto">
      <div className="w-full max-w-xl bg-[#161424] border-2 border-[#D6A447] rounded-xl p-5 sm:p-7 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#D6A447]/30 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={22} className="text-[#F59E0B]" />
            <h2 className="font-['Cinzel'] font-black text-lg sm:text-xl text-[#FEF08A] tracking-wider">
              LEGAL DISCLAIMER / वैधानिक सूचना
            </h2>
          </div>
          <button
            onClick={() => {
              audio.playSound('click');
              onClose();
            }}
            className="p-1 text-[#D6A447] hover:text-white rounded bg-black/40 border border-[#D6A447]/40 cursor-pointer"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* ENGLISH SECTION */}
        <div className="space-y-3 text-xs sm:text-sm text-[#F1E7D0]/90 leading-relaxed mb-6 bg-black/30 p-4 rounded border border-[#D6A447]/20">
          <h3 className="font-['Cinzel'] font-black text-[#D6A447] text-xs uppercase tracking-wider">
            ENGLISH DISCLAIMER
          </h3>
          <p>
            <strong>FILMI DANGAL: LIGHTS. CAMERA. KNOCKOUT!</strong> is an original parody video game inspired by cinematic tropes, iconic archetypes, and cultural motifs of Indian Bollywood cinema.
          </p>
          <p>
            All characters, names, moves, dialogues, and visual assets are purely fictional, original caricatures and parodies. This game does not use copyrighted movie footage, official posters, protected trademarks, unauthorized celebrity likenesses, or voice cloning.
          </p>
          <p className="text-white/60 text-xs">
            Any resemblance to actual persons, living or dead, or actual copyrighted films is entirely coincidental and intended strictly for artistic satire, comedy, and transformative entertainment.
          </p>
        </div>

        {/* HINDI SECTION */}
        <div className="space-y-3 text-xs sm:text-sm text-[#F1E7D0]/90 leading-relaxed mb-6 bg-black/30 p-4 rounded border border-[#D6A447]/20">
          <h3 className="font-['Cinzel'] font-black text-[#D6A447] text-xs uppercase tracking-wider">
            हिंदी वैधानिक अस्वीकरण
          </h3>
          <p>
            <strong>फ़िल्मी दंगल</strong> भारतीय सिनेमा के प्रसिद्ध नाट्य रूपांतरों, किरदारों और मनोरंजक शैलियों से प्रेरित एक मौलिक हास्य और पैरोडी गेम है।
          </p>
          <p>
            इस खेल में प्रस्तुत सभी पात्र, नाम, संवाद, और दृश्य पूर्णतः काल्पनिक, मूल रचनाएँ और व्यंग्यात्मक हैं। इसमें किसी भी कॉपीराइटेड फ़िल्म के दृश्य, आधिकारिक पोस्टर, ट्रेडमार्क अथवा अनधिकृत आवाज़ों का उपयोग नहीं किया गया है।
          </p>
          <p className="text-white/60 text-xs">
            किसी भी वास्तविक व्यक्ति, जीवित या मृत, अथवा किसी वास्तविक फ़िल्म से कोई भी समानता केवल हास्य, व्यंग्य और कलात्मक मनोरंजन के उद्देश्य से है।
          </p>
        </div>

        <button
          onClick={() => {
            audio.playSound('click');
            onClose();
          }}
          className="w-full py-3 bg-[#BE123C] hover:bg-[#DC2626] text-white font-['Bungee'] text-sm tracking-wider rounded border border-[#FEF08A] cursor-pointer"
        >
          I UNDERSTAND & ACCEPT
        </button>
      </div>
    </div>
  );
};
