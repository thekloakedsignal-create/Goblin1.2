interface GoblinAvatarProps {
  isSpeaking: boolean;
  isThinking: boolean;
}

export default function GoblinAvatar({ isSpeaking, isThinking }: GoblinAvatarProps) {
  return (
    <div className="relative w-full overflow-hidden bg-[#020205]" style={{ height: "168px" }}>
      <svg
        viewBox="0 0 400 155"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
        style={{ display: "block" }}
      >
        <defs>
          <filter id="goblinGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="goblinStrongGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="ambientGlow" cx="50%" cy="100%" r="60%">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="eyeRadial" cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="100%" stopColor="#15803d" />
          </radialGradient>
        </defs>

        <style>{`
          @keyframes goblinLed1 { 0%,88%,100%{opacity:1} 89%,94%{opacity:0.05} }
          @keyframes goblinLed2 { 0%,43%,100%{opacity:1} 44%,49%{opacity:0.05} }
          @keyframes goblinLed3 { 0%,69%,100%{opacity:1} 70%,75%{opacity:0.15} }
          @keyframes goblinEye  { 0%,100%{opacity:0.85} 50%{opacity:1} }
          @keyframes goblinBreath {
            0%,100%{transform:translateY(0px)}
            50%{transform:translateY(-2.5px)}
          }
          @keyframes goblinScan {
            0%{transform:translateY(-2px)}
            100%{transform:translateY(157px)}
          }
          .gob-body { animation: goblinBreath 3.2s ease-in-out infinite; }
          .gob-eye  { animation: goblinEye 2.4s ease-in-out infinite; }
        `}</style>

        {/* ── Background ── */}
        <rect width="400" height="155" fill="#020205" />
        <rect width="400" height="155" fill="url(#ambientGlow)" />

        {/* ── Left server rack ── */}
        <rect x="0" y="0" width="70" height="155" fill="#05080a" stroke="#22c55e" strokeWidth="0.7" />
        {Array.from({ length: 8 }, (_, i) => {
          const y = 7 + i * 18;
          const dur1 = (1.6 + i * 0.38).toFixed(2);
          const dur2 = (2.1 + i * 0.27).toFixed(2);
          const anim1 = `goblinLed${(i % 3) + 1}`;
          const anim2 = `goblinLed${((i + 1) % 3) + 1}`;
          return (
            <g key={`lr${i}`}>
              <rect x="3" y={y} width="64" height="14" fill="#090e09" stroke="#1a3320" strokeWidth="0.4" />
              <circle cx="13" cy={y + 7} r="3.2" fill="#22c55e" style={{ animation: `${anim1} ${dur1}s infinite` }} />
              <circle cx="22" cy={y + 7} r="3.2" fill={i % 5 === 2 ? "#f59e0b" : "#22c55e"} style={{ animation: `${anim2} ${dur2}s infinite` }} />
              <rect x="30" y={y + 4} width="34" height="5" rx="1" fill="#0d130d" stroke="#1a3320" strokeWidth="0.3" />
            </g>
          );
        })}

        {/* ── Right server rack ── */}
        <rect x="330" y="0" width="70" height="155" fill="#05080a" stroke="#22c55e" strokeWidth="0.7" />
        {Array.from({ length: 8 }, (_, i) => {
          const y = 7 + i * 18;
          const dur1 = (2.3 + i * 0.31).toFixed(2);
          const dur2 = (1.9 + i * 0.22).toFixed(2);
          const anim1 = `goblinLed${((i + 2) % 3) + 1}`;
          const anim2 = `goblinLed${(i % 3) + 1}`;
          return (
            <g key={`rr${i}`}>
              <rect x="333" y={y} width="64" height="14" fill="#090e09" stroke="#1a3320" strokeWidth="0.4" />
              <circle cx="343" cy={y + 7} r="3.2" fill={i % 4 === 1 ? "#f59e0b" : "#22c55e"} style={{ animation: `${anim1} ${dur1}s infinite` }} />
              <circle cx="352" cy={y + 7} r="3.2" fill="#22c55e" style={{ animation: `${anim2} ${dur2}s infinite` }} />
              <rect x="360" y={y + 4} width="34" height="5" rx="1" fill="#0d130d" stroke="#1a3320" strokeWidth="0.3" />
            </g>
          );
        })}

        {/* ── Cave floor ── */}
        <rect x="70" y="142" width="260" height="13" fill="#060808" />
        <line x1="70" y1="142" x2="330" y2="142" stroke="#22c55e" strokeWidth="0.7" opacity="0.45" />

        {/* ── Goblin character ── */}
        <g className="gob-body">

          {/* Body */}
          <ellipse cx="200" cy="137" rx="33" ry="20" fill="#152815" stroke="#22c55e" strokeWidth="1.1" />

          {/* Chest plate */}
          <rect x="188" y="124" width="24" height="9" rx="2" fill="#080f08" stroke="#22c55e" strokeWidth="0.9" />
          {[192, 197, 202, 207].map((x, i) => (
            <circle key={x} cx={x} cy="128.5" r="1.9"
              fill="#22c55e"
              style={{ animation: `goblinLed${(i % 3) + 1} ${(1 + i * 0.45).toFixed(2)}s infinite` }} />
          ))}

          {/* GoblinCoin medallion */}
          <circle cx="200" cy="120" r="5.5" fill="#181000" stroke="#f59e0b" strokeWidth="1.3" />
          <text x="200" y="123" textAnchor="middle" fontSize="5.5" fill="#f59e0b" fontFamily="monospace" fontWeight="bold">₢</text>

          {/* Arms */}
          <path d="M 168 134 Q 155 142 147 153" stroke="#152815" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M 168 134 Q 155 142 147 153" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" fill="none" />
          <path d="M 232 134 Q 245 142 253 153" stroke="#152815" strokeWidth="13" strokeLinecap="round" fill="none" />
          <path d="M 232 134 Q 245 142 253 153" stroke="#22c55e" strokeWidth="0.9" strokeLinecap="round" fill="none" />

          {/* Claws */}
          <path d="M 147 153 L 141 160 M 147 153 L 147 162 M 147 153 L 153 160" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M 253 153 L 247 160 M 253 153 L 253 162 M 253 153 L 259 160" stroke="#22c55e" strokeWidth="1.4" strokeLinecap="round" />

          {/* Neck */}
          <rect x="193" y="109" width="14" height="12" rx="3" fill="#152815" />

          {/* Head */}
          <ellipse cx="200" cy="82" rx="37" ry="33" fill="#152815" stroke="#22c55e" strokeWidth="1.2" />

          {/* Left ear — pointy */}
          <polygon points="163,78 149,53 173,70" fill="#152815" stroke="#22c55e" strokeWidth="1.2" />
          <line x1="162" y1="75" x2="154" y2="59" stroke="#22c55e" strokeWidth="0.65" opacity="0.5" />
          <line x1="165" y1="73" x2="159" y2="60" stroke="#22c55e" strokeWidth="0.5" opacity="0.35" />

          {/* Right ear — pointy */}
          <polygon points="237,78 251,53 227,70" fill="#152815" stroke="#22c55e" strokeWidth="1.2" />
          <line x1="238" y1="75" x2="246" y2="59" stroke="#22c55e" strokeWidth="0.65" opacity="0.5" />
          <line x1="235" y1="73" x2="241" y2="60" stroke="#22c55e" strokeWidth="0.5" opacity="0.35" />

          {/* Forehead circuit traces */}
          <path d="M 176 62 L 183 57 L 188 62 L 193 58" stroke="#22c55e" strokeWidth="0.65" fill="none" opacity="0.4" />
          <path d="M 207 58 L 212 62 L 217 57 L 224 62" stroke="#22c55e" strokeWidth="0.65" fill="none" opacity="0.4" />
          <circle cx="193" cy="58" r="1.8" fill="#22c55e" opacity="0.45" />
          <circle cx="207" cy="58" r="1.8" fill="#22c55e" opacity="0.45" />

          {/* Forehead cyber patch */}
          <rect x="194" y="51" width="12" height="7" rx="1.5" fill="#080f08" stroke="#22c55e" strokeWidth="0.8" />
          {[196, 199, 202, 205].map((x) => (
            <line key={x} x1={x} y1="52" x2={x} y2="57" stroke="#22c55e" strokeWidth="0.5" />
          ))}

          {/* Eye sockets */}
          <ellipse cx="183" cy="82" rx="13" ry="11" fill="#060e06" />
          <ellipse cx="217" cy="82" rx="13" ry="11" fill="#060e06" />

          {/* Eye glow halos */}
          <ellipse cx="183" cy="82" rx="12" ry="10" fill="#22c55e" opacity="0.18"
            filter="url(#goblinGlow)" className="gob-eye" />
          <ellipse cx="217" cy="82" rx="12" ry="10" fill="#22c55e" opacity="0.18"
            filter="url(#goblinGlow)" className="gob-eye" />

          {/* Irises */}
          <ellipse cx="183" cy="82" rx="9" ry="8" fill="url(#eyeRadial)"
            filter="url(#goblinGlow)" className="gob-eye" />
          <ellipse cx="217" cy="82" rx="9" ry="8" fill="url(#eyeRadial)"
            filter="url(#goblinGlow)" className="gob-eye" />

          {/* Pupils — shift slightly when thinking */}
          <ellipse cx={isThinking ? 180 : 183} cy="82" rx="4" ry="5" fill="#04080a">
            {isThinking && (
              <animate attributeName="cx" values="183;180;183" dur="1.8s" repeatCount="indefinite" />
            )}
          </ellipse>
          <ellipse cx={isThinking ? 220 : 217} cy="82" rx="4" ry="5" fill="#04080a">
            {isThinking && (
              <animate attributeName="cx" values="217;220;217" dur="1.8s" repeatCount="indefinite" />
            )}
          </ellipse>

          {/* Eye highlights */}
          <circle cx="179" cy="78" r="2" fill="white" opacity="0.65" />
          <circle cx="213" cy="78" r="2" fill="white" opacity="0.65" />

          {/* Nose */}
          <ellipse cx="200" cy="93" rx="5" ry="3.5" fill="#122012" />
          <ellipse cx="197" cy="93" rx="1.8" ry="1.5" fill="#060e06" />
          <ellipse cx="203" cy="93" rx="1.8" ry="1.5" fill="#060e06" />

          {/* Mouth — open & animated when speaking, smile when silent */}
          {isSpeaking ? (
            <ellipse cx="200" cy="104" rx="11" ry="5" fill="#060e06" stroke="#22c55e" strokeWidth="1.4">
              <animate attributeName="ry" values="3;8;4;9;3" dur="0.55s" repeatCount="indefinite" />
            </ellipse>
          ) : (
            <path
              d="M 188 103 Q 200 109 212 103"
              stroke="#22c55e"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
          )}

          {/* Cheek implants */}
          <rect x="161" y="88" width="9" height="6" rx="1" fill="#080f08" stroke="#22c55e" strokeWidth="0.7" />
          <circle cx="165.5" cy="91" r="1.5" fill="#22c55e" opacity="0.65"
            style={{ animation: "goblinEye 2.2s infinite" }} />
          <rect x="230" y="88" width="9" height="6" rx="1" fill="#080f08" stroke="#22c55e" strokeWidth="0.7" />
          <circle cx="234.5" cy="91" r="1.5" fill="#22c55e" opacity="0.65"
            style={{ animation: "goblinEye 1.85s infinite" }} />

        </g>{/* end goblin group */}

        {/* Scan line overlay */}
        <rect x="70" y="0" width="260" height="1.2" fill="#22c55e" opacity="0.035">
          <animateTransform
            attributeName="transform"
            type="translate"
            from="0 0"
            to="0 156"
            dur="9s"
            repeatCount="indefinite"
          />
        </rect>

      </svg>

      {/* Status bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-3 py-0.5 bg-black/90 border-t border-green-500/30">
        <span className="text-[9px] text-green-800 font-mono uppercase tracking-widest">GOBLIN.EXE</span>
        <span
          className={`text-[9px] font-mono uppercase tracking-widest transition-colors ${
            isSpeaking
              ? "text-green-400 animate-pulse"
              : isThinking
              ? "text-yellow-500 animate-pulse"
              : "text-green-900"
          }`}
        >
          {isSpeaking ? "◉ TRANSMITTING" : isThinking ? "◉ PROCESSING" : "● STANDBY"}
        </span>
        <span className="text-[9px] text-green-800 font-mono uppercase tracking-widest">CAVE NET</span>
      </div>
    </div>
  );
}
