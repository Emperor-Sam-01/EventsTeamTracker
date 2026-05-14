import React, { useEffect, useState, useRef } from 'react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, ROLE_LABELS } from '../utils/format';

// ─── DISC compatibility data ──────────────────────────────────────────────────
const DISC_INFO = {
  D: { label: 'Dominance', color: '#ef4444', bg: 'bg-red-100 text-red-800', desc: 'Direct, decisive, results-oriented, strong-willed' },
  I: { label: 'Influence',  color: '#f97316', bg: 'bg-orange-100 text-orange-800', desc: 'Optimistic, enthusiastic, persuasive, collaborative' },
  S: { label: 'Steadiness', color: '#22c55e', bg: 'bg-green-100 text-green-800', desc: 'Calm, patient, reliable, supportive, consistent' },
  C: { label: 'Conscientiousness', color: '#3b82f6', bg: 'bg-blue-100 text-blue-800', desc: 'Analytical, precise, systematic, quality-focused' },
};

const DISC_COMPAT = {
  DD: { score: 55, label: 'Competitive Pair', desc: 'Two strong-willed personalities that can drive results but may clash over control.', good: ['Both decisive and results-focused', 'High energy when aligned on a goal', 'Shared drive for winning'], watch: ['Power struggles are likely', 'Neither easily backs down', 'May compete rather than collaborate'], tip: 'Assign clear ownership to each person — overlapping responsibilities will cause friction.' },
  DI: { score: 82, label: 'Dynamic Duo', desc: 'D provides drive and structure; I brings enthusiasm and relationship energy. A natural partnership.', good: ['Complementary strengths', 'D focuses on results, I on people', 'High-performing client-facing pair'], watch: ['D may see I as unfocused', 'I may feel D is too blunt', 'Agree on priorities upfront'], tip: 'Let D lead the strategy; let I lead the relationship. Brief each other regularly.' },
  DS: { score: 68, label: 'Driver & Anchor', desc: 'D provides momentum while S provides stability. Effective when D moderates pace.', good: ['D pushes progress, S ensures quality', 'S steadies D\'s urgency', 'Reliable and productive when balanced'], watch: ['D may rush or overwhelm S', 'S may seem too slow for D', 'D should practice patience'], tip: 'D: give advance notice before changes. S: speak up early when feeling pressured.' },
  DC: { score: 72, label: 'Precision Partners', desc: 'Both task-focused — D wants speed, C wants accuracy. Tension exists but outcomes are high quality.', good: ['D\'s drive + C\'s analysis = strong results', 'Both take work seriously', 'Complementary risk perspectives'], watch: ['D finds C too slow or overcautious', 'C frustrated by D\'s impatience', 'Decision-making speed mismatch'], tip: 'Agree on standards before starting. D sets the deadline; C sets the quality bar.' },
  II: { score: 75, label: 'Energy Overload', desc: 'Highly enthusiastic and fun. Great for ideation but need external accountability.', good: ['Incredible creative energy', 'Strong networking and client rapport', 'Optimistic and motivating'], watch: ['Both may avoid conflict', 'Follow-through can suffer', 'Easy to get off-track together'], tip: 'Build in checkpoints — someone external may need to hold both accountable.' },
  IS: { score: 90, label: 'Warm Alliance', desc: 'Highly compatible — I\'s enthusiasm and S\'s warmth create a genuinely collaborative dynamic.', good: ['Excellent team morale', 'Strong client relationships', 'Both empathetic and supportive'], watch: ['May avoid difficult decisions', 'Too accommodating with demanding clients', 'Conflict avoidance'], tip: 'Be conscious of saying no when needed. Check in honestly and regularly.' },
  IC: { score: 62, label: 'Ideas vs. Analysis', desc: 'I brings energy and big ideas; C brings structure and rigor. Frustrating but balanced.', good: ['I generates ideas, C stress-tests them', 'Balanced approach to clients', 'Productive when roles are clear'], watch: ['I may see C as a wet blanket', 'C may find I unfocused', 'Communication style gap'], tip: 'I: let C review before pushing forward. C: acknowledge ideas positively before critiquing.' },
  SS: { score: 80, label: 'Steady Alliance', desc: 'Very harmonious and supportive. Reliable and consistent, though may avoid necessary conflict.', good: ['Smooth, low-drama working relationship', 'Both consistent and dependable', 'Strong client retention focus'], watch: ['May avoid difficult conversations', 'Slow to change', 'May defer decisions too long'], tip: 'Assign one person to play devil\'s advocate in key decisions to avoid groupthink.' },
  SC: { score: 85, label: 'Methodical Match', desc: 'Both careful, thorough, and reliable. Produces quality work at a measured pace.', good: ['Extremely dependable and accurate', 'Thoughtful decision-making', 'High quality output'], watch: ['Can be slow to act', 'May overthink or over-plan', 'Can miss time-sensitive opportunities'], tip: 'Set clear deadlines. Assign one person as the final decision-maker to avoid stalling.' },
  CC: { score: 70, label: 'Analytical Alliance', desc: 'Two detail-oriented thinkers producing accurate, well-researched outputs — decisions can stall.', good: ['Highest accuracy and quality', 'Both thorough and systematic', 'Strong at complex analysis'], watch: ['Analysis paralysis is a real risk', 'Slow to decide', 'Uncomfortable with risk'], tip: 'Define what "good enough" looks like before starting — not everything needs to be perfect.' },
};

const DISC_INSIGHTS = {
  D: {
    tagline: 'The Driver',
    strengths: ['Decisive and action-oriented', 'Natural leader under pressure', 'Results-focused and persistent', 'Thrives in competitive environments'],
    growth: ['Can come across as blunt or dismissive', 'May overlook team feelings', 'Tends to move too fast without enough detail', 'Struggles with routine or slow-paced work'],
    motivates: ['Challenges and competition', 'Control and autonomy', 'Achieving visible results', 'Recognition for achievements'],
    stresses: ['Loss of control or slow pace', 'Too many rules or restrictions', 'Having to rely on others', 'Indecisiveness around them'],
    communication: 'Be direct, brief, and results-focused. Skip small talk. Lead with the bottom line and give options — not instructions.',
    clientTip: 'Lead with ROI and outcomes. Be confident and decisive. Avoid wishy-washy proposals — D clients respect clear, bold recommendations.',
  },
  I: {
    tagline: 'The Influencer',
    strengths: ['Enthusiastic and inspiring', 'Natural relationship-builder', 'Creative and idea-rich', 'Excellent at rallying people'],
    growth: ['May lack follow-through', 'Can be disorganised under pressure', 'Overpromises at times', 'Struggles with detail-heavy work'],
    motivates: ['Social recognition and praise', 'Creative freedom and variety', 'Collaborative environments', 'Fun and excitement'],
    stresses: ['Being ignored or isolated', 'Repetitive, detail-heavy tasks', 'Rigid structure and rules', 'Conflict or negative feedback'],
    communication: 'Be warm, enthusiastic, and collaborative. Allow them to share ideas. Acknowledge contributions publicly. Avoid cold or overly formal interactions.',
    clientTip: 'Build the relationship first — they buy from people they like. Use storytelling over data. Follow up in writing to keep them accountable.',
  },
  S: {
    tagline: 'The Stabiliser',
    strengths: ['Dependable and consistent', 'Great listener and team player', 'Calm under pressure', 'Excellent at follow-through'],
    growth: ['May avoid conflict even when needed', 'Resistant to sudden change', 'Can be slow to make decisions', 'May not voice concerns proactively'],
    motivates: ['Stability and security', 'Sincere appreciation and belonging', 'Clear expectations and processes', 'Helping others succeed'],
    stresses: ['Sudden or unexplained change', 'Conflict or confrontation', 'Feeling unappreciated', 'Unclear or shifting priorities'],
    communication: 'Be patient, warm, and consistent. Give advance notice before changes. Ask for their opinion — they often hold back. Avoid being pushy.',
    clientTip: 'Build trust over time — they aren\'t impulse buyers. Be patient and reassuring. Provide detailed timelines and follow up reliably.',
  },
  C: {
    tagline: 'The Analyst',
    strengths: ['Precise and detail-oriented', 'Systematic and logical', 'High personal standards', 'Excellent at planning and analysis'],
    growth: ['Can over-analyse and delay decisions', 'May appear cold or detached', 'Highly critical of self and others', 'Can struggle with ambiguity'],
    motivates: ['Quality and accuracy', 'Understanding the "why"', 'Structured processes and clear standards', 'Recognition for expertise'],
    stresses: ['Unclear expectations or standards', 'Being asked to cut corners', 'Criticism without specific feedback', 'High-pressure emotionally charged environments'],
    communication: 'Be prepared with data and detail. Avoid emotional appeals — lead with logic. Give them time to process and respond. Don\'t rush decisions.',
    clientTip: 'Provide thorough proposals with supporting data. Be precise on pricing and timelines. Expect detailed questions — answer them completely.',
  },
};

const DISC_ROLE_TIPS = {
  D: {
    bd:   "Your directness is an asset in BD. Lead with clear value propositions and close confidently. Clients respect decisiveness. Watch your pace with analytical buyers — slow down to let them process. Your urgency can be infectious in a positive way when aligned with the client's goals.",
    pe:   "You thrive under event-day pressure. When things go sideways, make the call quickly and move on. Brief your team and vendors with crystal-clear instructions — ambiguity costs time and money. With clients, be confident but document every promise made so nothing slips.",
    mgmt: "Your drive sets the team's pace. Channel it into clear goal-setting, accountability structures, and visible wins. Be conscious of how your directness lands on S and C types — what feels efficient to you can feel dismissive to them.",
  },
  I: {
    bd:   "You build rapport faster than almost anyone — lean into it. Lead with enthusiasm and paint a vivid picture of what the event could be. Convert that energy into follow-through: send the proposal the same day, not next week. Follow up in writing to keep clients accountable.",
    pe:   "Your energy keeps the atmosphere positive on event day and clients love working with you. Back it up with a solid pre-event checklist so no detail slips. Your warmth handles stressed clients brilliantly — use it when things go sideways. Build systems with your team to cover the detail gaps.",
    mgmt: "You inspire the team and bring energy to every room. Balance inspiration with structure — written follow-ups, regular check-ins, and holding people accountable even when it feels uncomfortable. Recognition from you means a lot; use it strategically.",
  },
  S: {
    bd:   "Your patience and genuine care build lasting client trust — clients come back to you because you listen and deliver. Push yourself to ask for the close directly; your track record earns that confidence. Set consistent weekly outreach targets and honour them even when it feels uncomfortable.",
    pe:   "You're the calm anchor during chaotic events. Clients feel genuinely reassured by your steady, reliable presence. Invest time in thorough vendor briefings and build those relationships early. Your composure when things go wrong is one of your most valuable traits on event day.",
    mgmt: "Your team feels safe and supported with you. Maintain that while leaning harder into performance conversations — avoiding difficult feedback doesn't help your team grow. Structure regular 1-1s so issues surface before they become bigger problems.",
  },
  C: {
    bd:   "Your proposals are the most thorough and credible on the team. Back every recommendation with precise data and clear logic. Learn to read the room — some clients need a bolder close, not more data. After your presentation, ask directly: 'Does this work for you?' Avoid leaving without a clear next step.",
    pe:   "Your pre-event planning is exceptional — vendors and clients trust your runsheets completely. On event day, trust your preparation and adapt quickly rather than over-analysing mid-event. Not everything will go perfectly, and that's okay; your contingency planning already sets you apart.",
    mgmt: "Your high standards elevate the team's quality output. Be explicit about your expectations so others can consistently meet them. Create space for creative thinking in the team — not every idea needs to be fully stress-tested before it's worth exploring.",
  },
};

function getRoleTip(type, role) {
  const cat = ['bde','sbde','bda'].includes(role) ? 'bd'
            : ['pe','spe','pa'].includes(role) ? 'pe'
            : 'mgmt';
  const label = cat === 'bd'   ? '💼 Sales & BD Tips for Your Style'
              : cat === 'pe'   ? '🎪 Event Management Tips for Your Style'
              :                  '👥 Leadership & Management Tips for Your Style';
  return { text: DISC_ROLE_TIPS[type]?.[cat] || '', label };
}

function IndividualInsight({ type, role }) {
  const info = DISC_INFO[type];
  const insight = DISC_INSIGHTS[type];
  if (!insight) return null;
  const roleTip = getRoleTip(type, role);
  return (
    <div className="card mt-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`px-3 py-1 rounded-full text-sm font-semibold ${info.bg}`}>{type} — {insight.tagline}</div>
        <p className="text-xs text-gray-500">{info.desc}</p>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-green-700 mb-2">💪 Key Strengths</div>
          <ul className="space-y-0.5">{insight.strengths.map((s,i)=><li key={i} className="text-xs text-green-800">• {s}</li>)}</ul>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-amber-700 mb-2">🌱 Growth Areas</div>
          <ul className="space-y-0.5">{insight.growth.map((s,i)=><li key={i} className="text-xs text-amber-800">• {s}</li>)}</ul>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-blue-700 mb-2">⚡ What Motivates You</div>
          <ul className="space-y-0.5">{insight.motivates.map((s,i)=><li key={i} className="text-xs text-blue-800">• {s}</li>)}</ul>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-red-700 mb-2">😓 What Stresses You</div>
          <ul className="space-y-0.5">{insight.stresses.map((s,i)=><li key={i} className="text-xs text-red-800">• {s}</li>)}</ul>
        </div>
      </div>
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
        <div className="text-xs font-semibold text-gray-700 mb-1">🗣 How to Communicate With You</div>
        <p className="text-xs text-gray-700">{insight.communication}</p>
      </div>
      {roleTip.text && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-brand-700 mb-1">{roleTip.label}</div>
          <p className="text-xs text-brand-800">{roleTip.text}</p>
        </div>
      )}
    </div>
  );
}

function getCompat(a, b) {
  const key = [a, b].sort().join('');
  return DISC_COMPAT[key] || DISC_COMPAT[[b,a].join('')] || null;
}

// ─── Chatbot ──────────────────────────────────────────────────────────────────
const BOT_RESPONSES = [
  { match: ['proposal', 'pitch', 'quote'], reply: "For a strong events proposal, lead with the client's vision and ROI, not just a price sheet. Structure it as: (1) Understanding of brief, (2) Concept overview, (3) Event flow/timeline, (4) Budget breakdown, (5) Why us. Keep it visual — clients rarely read walls of text." },
  { match: ['idea', 'concept', 'theme'], reply: "Some event theme ideas that consistently perform well: Gatsby/Black Tie galas, Festival-style team days, Interactive tech showcases, Sustainability-forward events, Cultural fusion celebrations. For corporate D&Ds, immersive themes (casino night, murder mystery) always drive engagement." },
  { match: ['client', 'prospect', 'cold', 'email', 'outreach'], reply: "The best cold emails are under 100 words. Lead with a specific observation about their business (a recent award, event, or press mention). Propose one concrete idea relevant to them. End with a soft ask: 'Worth a 15-minute call?' — not 'Please find attached our deck'." },
  { match: ['gp', 'gross profit', 'margin', 'target'], reply: "To improve GP on events: (1) Negotiate supplier rates annually — even 5% savings compounds, (2) Bundle add-ons as packages rather than line items, (3) Anchor on premium pricing first and let the client negotiate down, (4) Review cost overruns post-event and update templates accordingly." },
  { match: ['pipeline', 'conversion', 'close', 'deal'], reply: "Pipeline health tip: a client who's been in 'pipeline' for more than 8 weeks without a concrete next step is likely a ghost. Set a deadline internally — if no response after 2 follow-ups, move to prospect and redirect energy to warmer leads." },
  { match: ['disc', 'personality', 'team', 'working'], reply: "Understanding your DISC type can transform client interactions. D types: lead with results and efficiency. I types: build rapport first, be enthusiastic. S types: be patient, provide detail and reassurance. C types: back everything with data, minimise small talk. Check your DISC profile in the tab above!" },
  { match: ['motivation', 'stress', 'burnout', 'tired'], reply: "Events is a high-pressure industry. A few things that help: (1) Front-load your week so Fridays feel earned, (2) Celebrate small wins publicly with your team, (3) If your pipeline feels dry, set a small daily outreach goal — even 3 emails — rather than a large weekly one. Momentum builds momentum." },
  { match: ['negotiat', 'vendor', 'supplier'], reply: "When negotiating with vendors: (1) Always get at least 2 quotes — even if you prefer one supplier, (2) Bundle volume across events to get better rates, (3) Pay faster for early-payment discounts, (4) Build relationships before you need a favour — urgency is expensive." },
];

const DEFAULT_BOT = "That's a great question! As your Advice Guru, I can help with proposals, event concepts, client outreach, GP targets, and team dynamics. Try asking me about any of those topics, or check out the DISC profiles tab to understand how to work better with your teammates.";

function getBotReply(msg) {
  const lower = msg.toLowerCase();
  for (const r of BOT_RESPONSES) {
    if (r.match.some(kw => lower.includes(kw))) return r.reply;
  }
  return DEFAULT_BOT;
}

function ChatSection() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    { from: 'bot', text: `Hi ${user.name.split(' ')[0]}! 👋 I'm your Advice Guru. Ask me about proposals, event ideas, client outreach, GP targets, or team dynamics. What's on your mind?` }
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { from: 'user', text: userMsg }]);
    setTyping(true);
    setTimeout(() => {
      setMessages(m => [...m, { from: 'bot', text: getBotReply(userMsg) }]);
      setTyping(false);
    }, 800 + Math.random() * 600);
  };

  return (
    <div className="flex flex-col h-[600px]">
      <div className="card flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 pb-3 border-b mb-3">
          <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white text-lg">🧠</div>
          <div>
            <div className="font-semibold text-gray-900 text-sm">Advice Guru</div>
            <div className="text-xs text-green-500">● Online</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.from === 'bot' && <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-sm mr-2 shrink-0 mt-0.5">🧠</div>}
              <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.from === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-sm">🧠</div>
              <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex gap-1">
                {[0,1,2].map(i => <span key={i} className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}} />)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <input
            className="input flex-1 text-sm"
            placeholder="Ask about proposals, event ideas, client tips..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          />
          <button onClick={send} className="btn-primary px-4 text-sm">Send</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center mt-2">AI integration coming soon — responses are curated guidance for now.</p>
    </div>
  );
}

// ─── DISC ─────────────────────────────────────────────────────────────────────
function DISCBar({ type, value }) {
  const info = DISC_INFO[type];
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="font-medium text-gray-700">{type} — {info.label}</span>
        <span className="font-bold" style={{ color: info.color }}>{value}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div className="h-3 rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: info.color }} />
      </div>
    </div>
  );
}

function CompatScore({ score }) {
  const color = score >= 80 ? 'text-green-600' : score >= 65 ? 'text-amber-500' : 'text-red-500';
  const label = score >= 80 ? 'Highly Compatible' : score >= 65 ? 'Works Well Together' : 'Needs Extra Effort';
  return (
    <div className="text-center">
      <div className={`text-4xl font-black ${color}`}>{score}<span className="text-lg font-normal">/100</span></div>
      <div className={`text-sm font-medium mt-0.5 ${color}`}>{label}</div>
    </div>
  );
}

function TeamAnalysis({ myProfile, teamProfiles }) {
  const fullTeam = [myProfile, ...teamProfiles];
  const pairs = [];
  for (let i = 0; i < fullTeam.length; i++) {
    for (let j = i + 1; j < fullTeam.length; j++) {
      pairs.push({ a: fullTeam[i], b: fullTeam[j], compat: getCompat(fullTeam[i].dominant_type, fullTeam[j].dominant_type) });
    }
  }
  const typeCounts = { D: 0, I: 0, S: 0, C: 0 };
  fullTeam.forEach(p => { typeCounts[p.dominant_type] = (typeCounts[p.dominant_type] || 0) + 1; });
  const hasD = typeCounts.D > 0, hasI = typeCounts.I > 0, hasS = typeCounts.S > 0, hasC = typeCounts.C > 0;
  const avgScore = pairs.length > 0 ? Math.round(pairs.reduce((s, p) => s + (p.compat?.score || 0), 0) / pairs.length) : null;
  const avgColor = avgScore >= 80 ? 'text-green-600' : avgScore >= 65 ? 'text-amber-500' : 'text-red-500';
  const avgLabel = avgScore >= 80 ? 'Strong Team Fit' : avgScore >= 65 ? 'Good Working Pair' : 'Needs Extra Effort';
  return (
    <div className="space-y-4 border-t pt-4 mt-2">
      {/* Team score */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs font-semibold text-gray-700">Team of {fullTeam.length}</div>
          <div className="text-xs text-gray-400 mt-0.5">{fullTeam.map(p => p.name?.split(' ')[0] || 'You').join(' · ')}</div>
        </div>
        {avgScore !== null && (
          <div className="text-center bg-gray-50 rounded-xl px-5 py-2 border">
            <div className={`text-3xl font-black ${avgColor}`}>{avgScore}<span className="text-base font-normal text-gray-300">/100</span></div>
            <div className={`text-xs font-semibold mt-0.5 ${avgColor}`}>{avgLabel}</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {['D','I','S','C'].map(type => (
          <div key={type} className={`rounded-xl p-2 text-center border-2 ${typeCounts[type] > 0 ? `border-transparent ${DISC_INFO[type].bg}` : 'bg-gray-50 text-gray-300 border-gray-200'}`}>
            <div className="text-xl font-black">{typeCounts[type]}</div>
            <div className="text-xs font-bold">{type}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-green-700 mb-2">💪 Team Strengths</div>
          <ul className="space-y-0.5 text-xs text-green-800">
            {hasD && <li>• Drive and decisiveness to push things forward</li>}
            {hasI && <li>• Enthusiasm and relationship-building energy</li>}
            {hasS && <li>• Stability, follow-through, and consistent execution</li>}
            {hasC && <li>• Analytical rigour and attention to quality</li>}
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-xs font-semibold text-amber-700 mb-2">⚠ Potential Gaps</div>
          <ul className="space-y-0.5 text-xs text-amber-800">
            {!hasD && <li>• No strong driver — decisions may stall</li>}
            {!hasI && <li>• Low social energy — client rapport may need extra effort</li>}
            {!hasS && <li>• Limited steadiness — team may be reactive under pressure</li>}
            {!hasC && <li>• Low analytical presence — quality checks needed</li>}
            {hasD && hasI && hasS && hasC && <li>• Well-rounded mix — watch for communication style clashes</li>}
          </ul>
        </div>
      </div>
      {pairs.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700">Pairwise Compatibility</div>
          {pairs.map((pair, i) => {
            const c = pair.compat;
            const score = c?.score || 0;
            const color = score >= 80 ? 'text-green-600' : score >= 65 ? 'text-amber-500' : 'text-red-500';
            const barColor = score >= 80 ? 'bg-green-500' : score >= 65 ? 'bg-amber-400' : 'bg-red-400';
            return (
              <div key={i} className="border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-medium text-gray-800 flex items-center gap-1 flex-wrap">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${DISC_INFO[pair.a.dominant_type]?.bg}`}>{pair.a.dominant_type}</span>
                    {pair.a.name?.split(' ')[0] || 'You'}
                    <span className="text-gray-400 mx-1">↔</span>
                    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${DISC_INFO[pair.b.dominant_type]?.bg}`}>{pair.b.dominant_type}</span>
                    {pair.b.name?.split(' ')[0]}
                  </div>
                  <span className={`text-sm font-bold ml-2 shrink-0 ${color}`}>{score}/100</span>
                </div>
                {c && (
                  <>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mb-1.5">
                      <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                    </div>
                    <div className="text-xs text-gray-500"><span className="font-medium text-gray-700">{c.label}</span> — {c.tip}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DISCSection() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [teamIds, setTeamIds] = useState([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ d_score: 25, i_score: 25, s_score: 25, c_score: 25, notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/disc/me').then(r => {
      setProfile(r.data);
      if (r.data) setForm({ d_score: r.data.d_score, i_score: r.data.i_score, s_score: r.data.s_score, c_score: r.data.c_score, notes: r.data.notes || '' });
    }).catch(console.error);
    api.get('/disc').then(r => setAllProfiles(r.data)).catch(console.error);
  };
  useEffect(load, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/disc/me', form);
      load();
      setEditing(false);
    } catch (err) { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  const toggleTeam = id => setTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const teamProfiles = allProfiles.filter(p => teamIds.includes(p.user_id));
  const teammates = allProfiles.filter(p => p.user_id !== user.id);

  const radarData = profile ? [
    { type: 'D', value: profile.d_score },
    { type: 'I', value: profile.i_score },
    { type: 'S', value: profile.s_score },
    { type: 'C', value: profile.c_score },
  ] : [];

  return (
    <div className="space-y-6">
      {/* My Profile */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">My DISC Profile</h2>
          <div className="flex gap-2">
            <a href="https://www.123test.com/disc-personality-test/" target="_blank" rel="noopener noreferrer" className="text-xs text-brand-600 hover:underline">Take the test ↗</a>
            <button onClick={() => setEditing(e => !e)} className="btn-secondary text-xs px-3 py-1">{profile ? 'Edit' : 'Set Up Profile'}</button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Take the free test at <a href="https://www.123test.com/disc-personality-test/" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">123test.com</a>, then enter your percentages below. They should add up to 100.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {['d','i','s','c'].map(k => (
                <div key={k}>
                  <label className="label text-xs">{k.toUpperCase()} — {DISC_INFO[k.toUpperCase()].label}</label>
                  <input type="number" min="0" max="100" className="input text-center font-bold text-lg"
                    style={{ color: DISC_INFO[k.toUpperCase()].color }}
                    value={form[`${k}_score`]}
                    onChange={e => setForm(f => ({ ...f, [`${k}_score`]: parseInt(e.target.value)||0 }))}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <textarea className="input" rows={2} placeholder="Any context about your style, how you prefer to work, etc." value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} />
            </div>
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':'Save Profile'}</button>
              <button onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        ) : profile ? (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <DISCBar type="D" value={profile.d_score} />
              <DISCBar type="I" value={profile.i_score} />
              <DISCBar type="S" value={profile.s_score} />
              <DISCBar type="C" value={profile.c_score} />
              {profile.notes && <p className="text-xs text-gray-500 italic mt-2">{profile.notes}</p>}
            </div>
            <div className="flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="type" tick={{ fontSize: 14, fontWeight: 700 }} />
                  <Radar dataKey="value" stroke="#f97316" fill="#f97316" fillOpacity={0.25} />
                  <Tooltip formatter={v => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
              <div className={`px-3 py-1 rounded-full text-sm font-semibold ${DISC_INFO[profile.dominant_type]?.bg}`}>
                Dominant: {profile.dominant_type} — {DISC_INFO[profile.dominant_type]?.label}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="text-4xl mb-3">🎯</div>
            <p className="text-gray-600 font-medium">No profile set up yet</p>
            <p className="text-sm text-gray-400 mt-1">Take the free DISC test at 123test.com, then enter your scores above.</p>
          </div>
        )}
      </div>

      {/* Individual insights — hidden when team is selected */}
      {profile && teamIds.length === 0 && <IndividualInsight type={profile.dominant_type} role={user.role} />}

      {/* Build a Team */}
      {profile && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-gray-900">Build a Team</h2>
            {teamIds.length > 0 && (
              <button onClick={() => setTeamIds([])} className="text-xs text-gray-400 hover:text-gray-600">✕ Clear</button>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-4">Select teammates to see how well the group would work together on a project.</p>

          {teammates.length === 0 ? (
            <p className="text-xs text-gray-400">No teammates have set up their DISC profiles yet.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {teammates.map(p => {
                const isSelected = teamIds.includes(p.user_id);
                return (
                  <button
                    key={p.user_id}
                    onClick={() => toggleTeam(p.user_id)}
                    className={`border-2 rounded-xl p-3 text-center transition-all ${isSelected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <div className="text-sm font-medium text-gray-900 mb-1">{p.name.split(' ')[0]}</div>
                    <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-1 ${DISC_INFO[p.dominant_type]?.bg}`}>{p.dominant_type} — {DISC_INFO[p.dominant_type]?.label}</div>
                    {isSelected && <div className="text-brand-600 text-xs font-semibold mt-1">✓ In team</div>}
                  </button>
                );
              })}
            </div>
          )}

          {teamIds.length >= 1 && <TeamAnalysis myProfile={profile} teamProfiles={teamProfiles} />}
        </div>
      )}

      {/* Team Overview */}
      {allProfiles.length > 1 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Team DISC Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {allProfiles.map(p => (
              <div key={p.user_id} className="border rounded-xl p-3 text-center">
                <div className="text-sm font-medium text-gray-900 mb-1">{p.name.split(' ')[0]}</div>
                <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mb-2 ${DISC_INFO[p.dominant_type]?.bg}`}>{p.dominant_type}</div>
                <div className="space-y-0.5">
                  {['d','i','s','c'].map(k => (
                    <div key={k} className="w-full bg-gray-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${p[`${k}_score`]}%`, backgroundColor: DISC_INFO[k.toUpperCase()].color }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual Review ────────────────────────────────────────────────────────
const REVIEW_QUESTIONS = [
  'Have you achieved the goals set during your last catch-up? If not, what got in the way?',
  'Give yourself an overall performance rating from 1 to 10. (1 = very dissatisfied with your performance, 10 = absolutely crushing it)',
  'Tell us more about your score. If you rated 1–7: what held you back? If 8–10: what are you proudest of this quarter?',
  'Is there anything you\'re currently doing — or planning to start — that would push that rating higher next quarter?',
  'Is there anything the management team can do to better support you and help improve your results?',
  'Set at least 2 new goals for the coming quarter — include at least 1 personal goal and at least 1 work-related goal. These should be on top of any carry-over goals from last time.',
  'How are you planning to make meaningful progress on these goals over the next 3 months?',
  'Is there anything else you\'d like to raise, flag, or discuss?',
];

function fmtReviewDate(d) {
  if (!d) return null;
  return new Date(d.split('T')[0] + 'T12:00:00').toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ReviewSection() {
  const { user } = useAuth();
  const isBDM = user.role === 'bdm';
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3) + 1;
  const today = now.toISOString().split('T')[0];

  const [reviews, setReviews] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editingReview, setEditingReview] = useState(null);
  const [form, setForm] = useState({ user_id: '', quarter: currentQ, year: now.getFullYear(), answers: {}, summary: '', action_items: '', catch_up_date: today, location: '', spend: '' });
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = () => {
    api.get('/reviews').then(r => setReviews(r.data)).catch(console.error);
    if (isBDM) api.get('/users').then(r => setTeamUsers(r.data.filter(u => !['exec_pa','bdm'].includes(u.role)))).catch(console.error);
  };
  useEffect(load, []);

  const getPrevGoals = (userId, quarter, year) => {
    if (!userId) return null;
    const uid = parseInt(userId);
    const prev = reviews
      .filter(r => r.user_id === uid && (r.year < year || (r.year === year && r.quarter < quarter)))
      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.quarter - a.quarter)[0];
    if (!prev) return null;
    const goals = prev.answers?.[5] || prev.answers?.[6] || null;
    return { review: prev, goals };
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.post('/reviews', form);
      load();
      const userName = teamUsers.find(u => u.id === form.user_id)?.name || '';
      const userRole = teamUsers.find(u => u.id === form.user_id)?.role || '';
      setSelected({ ...form, ...res.data, user_name: userName, user_role: userRole });
      setCreating(false);
      setEditingReview(null);
    } catch (err) { alert('Failed to save catch-up'); }
    finally { setSaving(false); }
  };

  const startNew = () => {
    setForm({ user_id: '', quarter: currentQ, year: now.getFullYear(), answers: {}, summary: '', action_items: '', catch_up_date: today, location: '', spend: '' });
    setCreating(true);
    setEditingReview(null);
    setSelected(null);
  };

  const editReview = (r) => {
    setForm({
      user_id: r.user_id, quarter: r.quarter, year: r.year,
      answers: r.answers || {}, summary: r.summary || '', action_items: r.action_items || '',
      catch_up_date: r.catch_up_date ? r.catch_up_date.split('T')[0] : today,
      location: r.location || '', spend: r.spend || '',
    });
    setCreating(true);
    setEditingReview(r);
    setSelected(null);
  };

  const prevGoalsData = creating ? getPrevGoals(form.user_id, form.quarter, form.year) : null;

  if (creating) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{editingReview ? 'Edit Catch-Up' : 'New 1-1 Catch-Up'}</h2>
        <button onClick={() => { setCreating(false); setEditingReview(null); }} className="btn-secondary text-sm">← Back</button>
      </div>

      {/* Session details */}
      <div className="card">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Session Details</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.catch_up_date} onChange={e => setForm(f => ({ ...f, catch_up_date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Location</label>
            <input type="text" className="input" placeholder="e.g. Office, Zoom, Coffee" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div>
            <label className="label">Damage ($)</label>
            <input type="number" className="input" placeholder="0.00" min="0" step="0.01" value={form.spend} onChange={e => setForm(f => ({ ...f, spend: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Team member + quarter (BDM only) */}
      {isBDM && (
        <div className="card">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Team Member</label>
              <select className="input" value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: parseInt(e.target.value) || '' }))} required>
                <option value="">Select member...</option>
                {teamUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role.toUpperCase()})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Quarter</label>
              <select className="input" value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: parseInt(e.target.value) }))}>
                {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Year</label>
              <select className="input" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Previous goals reminder */}
      <div className={`card ${prevGoalsData?.goals ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-dashed border-gray-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          <span>📌</span>
          <div className="text-xs font-semibold text-gray-700">
            Goals from Previous Catch-Up
            {prevGoalsData && <span className="text-gray-400 font-normal ml-1">— Q{prevGoalsData.review.quarter} {prevGoalsData.review.year}</span>}
          </div>
        </div>
        {prevGoalsData?.goals ? (
          <p className="text-sm text-indigo-800 whitespace-pre-wrap">{prevGoalsData.goals}</p>
        ) : (
          <p className="text-xs text-gray-400 italic">No previous goals on record — this is the first session or the previous review didn't capture goals.</p>
        )}
      </div>

      {/* 8 Questions */}
      {REVIEW_QUESTIONS.map((q, i) => (
        <div key={i} className="card">
          <label className="label font-semibold text-gray-800 mb-2">Q{i+1}. {q}</label>
          <textarea className="input" rows={4} placeholder="Enter response..."
            value={form.answers[i] || ''}
            onChange={e => setForm(f => ({ ...f, answers: { ...f.answers, [i]: e.target.value } }))}
          />
        </div>
      ))}

      {/* BDM notes & action items */}
      {isBDM && (
        <>
          <div className="card bg-blue-50 border border-blue-200">
            <label className="label text-blue-800 font-semibold mb-2">📋 BDM Notes & Session Summary</label>
            <textarea className="input" rows={3} placeholder="Overall observations, themes from the session, notes for the record..." value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} />
          </div>
          <div className="card bg-amber-50 border border-amber-200">
            <label className="label text-amber-800 font-semibold mb-2">✅ Action Items</label>
            <textarea className="input" rows={4}
              placeholder={'e.g.\n- Increase weekly outreach to 20 cold calls\n- Block Fridays for proposal writing\n- Revisit Q6 goals in 4 weeks'}
              value={form.action_items} onChange={e => setForm(f => ({ ...f, action_items: e.target.value }))} />
          </div>
        </>
      )}

      <div className="flex gap-2 pb-4">
        <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Save Catch-Up'}</button>
        <button onClick={() => { setCreating(false); setEditingReview(null); }} className="btn-secondary">Cancel</button>
      </div>
    </div>
  );

  if (selected) {
    const prevData = getPrevGoals(selected.user_id, selected.quarter, selected.year);
    const ratingNum = parseInt(selected.answers?.[1]);
    const ratingColor = ratingNum >= 8 ? 'text-green-600' : ratingNum >= 5 ? 'text-amber-500' : 'text-red-500';
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {isBDM && selected.user_name ? `${selected.user_name} — ` : ''}Q{selected.quarter} {selected.year} Catch-Up
          </h2>
          <div className="flex gap-2">
            {isBDM && <button onClick={() => editReview(selected)} className="btn-secondary text-sm">Edit</button>}
            <button onClick={() => setSelected(null)} className="btn-secondary text-sm">← Back</button>
          </div>
        </div>

        {/* Session header */}
        <div className="card">
          <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
            <div>
              <div className="text-xs text-gray-400 mb-0.5">Date</div>
              <div className="text-sm font-medium text-gray-900">{fmtReviewDate(selected.catch_up_date) || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">Location</div>
              <div className="text-sm font-medium text-gray-900">{selected.location || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">Damage</div>
              <div className="text-sm font-medium text-gray-900">{selected.spend ? formatCurrency(selected.spend) : '—'}</div>
            </div>
          </div>
        </div>

        {/* Previous goals */}
        {prevData?.goals && (
          <div className="card bg-indigo-50 border border-indigo-200">
            <div className="text-xs font-semibold text-indigo-700 mb-2">📌 Goals from Previous Catch-Up (Q{prevData.review.quarter} {prevData.review.year})</div>
            <p className="text-sm text-indigo-800 whitespace-pre-wrap">{prevData.goals}</p>
          </div>
        )}

        {/* Rating highlight */}
        {selected.answers?.[1] && (
          <div className="card text-center py-4">
            <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider">Self-Rating This Quarter</div>
            <div className={`text-5xl font-black ${ratingColor}`}>
              {selected.answers[1]}<span className="text-xl text-gray-300 font-normal">/10</span>
            </div>
          </div>
        )}

        {/* Q&As */}
        {REVIEW_QUESTIONS.map((q, i) => selected.answers?.[i] ? (
          <div key={i} className="card">
            <div className="text-xs font-semibold text-brand-700 mb-1.5">Q{i+1}. {q}</div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.answers[i]}</p>
          </div>
        ) : null)}

        {/* BDM Summary */}
        {selected.summary && (
          <div className="card bg-blue-50 border border-blue-200">
            <div className="text-xs font-semibold text-blue-700 mb-1.5">📋 BDM Notes & Summary</div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.summary}</p>
          </div>
        )}

        {/* Action Items */}
        {selected.action_items && (
          <div className="card bg-amber-50 border border-amber-200">
            <div className="text-xs font-semibold text-amber-700 mb-1.5">✅ Action Items</div>
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.action_items}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">1-1 Catch-Up Reviews</h2>
        {isBDM && <button onClick={startNew} className="btn-primary text-sm">+ New Catch-Up</button>}
      </div>
      {reviews.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          <div className="text-4xl mb-3">📋</div>
          <p className="font-medium">{isBDM ? 'No catch-ups recorded yet. Start your first 1-1 session.' : 'No reviews yet. Your BDM will share them here after your catch-up.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {isBDM && teamUsers.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {teamUsers.map(u => {
                const count = reviews.filter(r => r.user_id === u.id).length;
                return (
                  <div key={u.id} className="card text-center py-3">
                    <div className="text-sm font-medium text-gray-900">{u.name.split(' ')[0]}</div>
                    <div className="text-2xl font-bold text-brand-600 mt-1">{count}</div>
                    <div className="text-xs text-gray-400">catch-up{count !== 1 ? 's' : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
          {reviews.map(r => {
            const ratingNum = parseInt(r.answers?.[1]);
            const ratingColor = ratingNum >= 8 ? 'text-green-600' : ratingNum >= 5 ? 'text-amber-500' : 'text-red-500';
            return (
              <div key={r.id} className="card flex items-center justify-between cursor-pointer hover:border-brand-300 border border-transparent transition-colors" onClick={() => setSelected(r)}>
                <div>
                  {isBDM && <div className="text-xs text-brand-600 font-medium">{r.user_name} ({r.user_role?.toUpperCase()})</div>}
                  <div className="font-medium text-gray-900">Q{r.quarter} {r.year} Catch-Up</div>
                  {r.catch_up_date && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {fmtReviewDate(r.catch_up_date)}{r.location ? ` · ${r.location}` : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3 ml-4 shrink-0">
                  {r.answers?.[1] && <div className={`text-base font-bold ${ratingColor}`}>{r.answers[1]}/10</div>}
                  <span className="text-gray-300">›</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Team Review ──────────────────────────────────────────────────────────────
function TeamReviewSection() {
  const { user } = useAuth();
  const isBDM = user.role === 'bdm';
  const [reviews, setReviews] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ quarter: '', year: new Date().getFullYear(), total_gp: '', total_projects: '', total_prospects: '', total_pipeline: '', highlights: '', challenges: '', action_items: '' });
  const [saving, setSaving] = useState(false);
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3) + 1;

  const load = () => api.get('/team-reviews').then(r => setReviews(r.data)).catch(console.error);
  useEffect(load, []);

  const loadStats = async (q, y) => {
    try {
      const r = await api.get(`/team-reviews/stats?quarter=${q}&year=${y}`);
      setForm(f => ({ ...f, total_gp: r.data.total_gp, total_projects: r.data.total_projects, total_prospects: r.data.total_prospects, total_pipeline: r.data.total_pipeline }));
    } catch {}
  };

  const startNew = () => {
    const f = { quarter: currentQ, year: now.getFullYear(), total_gp: '', total_projects: '', total_prospects: '', total_pipeline: '', highlights: '', challenges: '', action_items: '' };
    setForm(f);
    setCreating(true);
    setSelected(null);
    loadStats(currentQ, now.getFullYear());
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.post('/team-reviews', form);
      load();
      setCreating(false);
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  };

  if (creating) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Quarterly Team Review</h2>
        <button onClick={() => setCreating(false)} className="btn-secondary text-sm">← Back</button>
      </div>
      <div className="card space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Quarter</label>
            <select className="input" value={form.quarter} onChange={e => { const q=parseInt(e.target.value); setForm(f=>({...f,quarter:q})); loadStats(q,form.year); }}>
              {[1,2,3,4].map(q=><option key={q} value={q}>Q{q}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <select className="input" value={form.year} onChange={e => { const y=parseInt(e.target.value); setForm(f=>({...f,year:y})); loadStats(form.quarter,y); }}>
              {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><label className="label">Total GP ($)</label><input type="number" className="input" value={form.total_gp} onChange={e=>setForm(f=>({...f,total_gp:e.target.value}))} /></div>
          <div><label className="label">Total Projects</label><input type="number" className="input" value={form.total_projects} onChange={e=>setForm(f=>({...f,total_projects:e.target.value}))} /></div>
          <div><label className="label">Total Prospects</label><input type="number" className="input" value={form.total_prospects} onChange={e=>setForm(f=>({...f,total_prospects:e.target.value}))} /></div>
          <div><label className="label">Total Pipeline</label><input type="number" className="input" value={form.total_pipeline} onChange={e=>setForm(f=>({...f,total_pipeline:e.target.value}))} /></div>
        </div>
        <div><label className="label">Highlights & Wins</label><textarea className="input" rows={3} placeholder="Key achievements, standout projects, wins this quarter..." value={form.highlights} onChange={e=>setForm(f=>({...f,highlights:e.target.value}))} /></div>
        <div><label className="label">Challenges & Learnings</label><textarea className="input" rows={3} placeholder="What was difficult, what we learned, what to improve..." value={form.challenges} onChange={e=>setForm(f=>({...f,challenges:e.target.value}))} /></div>
        <div><label className="label">Team Action Items for Next Quarter</label><textarea className="input" rows={3} placeholder="e.g.&#10;- Increase team pipeline to 20 active clients&#10;- Launch new service category by Q3&#10;- Improve proposal hit rate to 40%" value={form.action_items} onChange={e=>setForm(f=>({...f,action_items:e.target.value}))} /></div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving?'Saving...':'Save Team Review'}</button>
          <button onClick={() => setCreating(false)} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );

  if (selected) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Q{selected.quarter} {selected.year} — Team Review</h2>
        <button onClick={() => setSelected(null)} className="btn-secondary text-sm">← Back</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total GP', value: formatCurrency(selected.total_gp), color: 'text-green-600' },
          { label: 'Projects', value: selected.total_projects, color: 'text-brand-600' },
          { label: 'Prospects', value: selected.total_prospects, color: 'text-purple-600' },
          { label: 'Pipeline', value: selected.total_pipeline, color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
      {selected.highlights && <div className="card bg-green-50 border border-green-200"><div className="text-xs font-semibold text-green-700 mb-2">🏆 Highlights & Wins</div><p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.highlights}</p></div>}
      {selected.challenges && <div className="card bg-amber-50 border border-amber-200"><div className="text-xs font-semibold text-amber-700 mb-2">⚠ Challenges & Learnings</div><p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.challenges}</p></div>}
      {selected.action_items && <div className="card bg-blue-50 border border-blue-200"><div className="text-xs font-semibold text-blue-700 mb-2">✅ Action Items — Next Quarter</div><p className="text-sm text-gray-800 whitespace-pre-wrap">{selected.action_items}</p></div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Team Quarterly Reviews</h2>
        {isBDM && <button onClick={startNew} className="btn-primary text-sm">+ New Team Review</button>}
      </div>
      {reviews.length === 0 ? (
        <div className="card text-center py-10 text-gray-500">
          <div className="text-4xl mb-3">📊</div>
          <p className="font-medium">{isBDM ? 'No team reviews yet. Create your first quarterly team snapshot.' : 'No team reviews published yet. Check back after your next team review session.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reviews.map(r => (
            <div key={r.id} className="card flex items-center justify-between cursor-pointer hover:border-brand-300 border border-transparent transition-colors" onClick={() => setSelected(r)}>
              <div>
                <div className="font-medium text-gray-900">Q{r.quarter} {r.year} — Team Review</div>
                <div className="text-xs text-gray-500 mt-0.5">{formatCurrency(r.total_gp)} GP · {r.total_projects} projects · {r.total_pipeline} pipeline · {r.total_prospects} prospects</div>
              </div>
              <span className="text-gray-300 ml-4">›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: 'chat',   label: '💬 Advice Chat' },
  { key: 'disc',   label: '🎯 DISC Profiles' },
  { key: 'review', label: '📋 1-1 Catch-Ups' },
  { key: 'team',   label: '📊 Team Reviews' },
];

export default function AdviceGuru() {
  const [tab, setTab] = useState('chat');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Advice Guru</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your hub for ideas, personality insights, and quarterly reviews.</p>
      </div>
      <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===t.key ? 'bg-white shadow text-brand-700' : 'text-gray-600 hover:text-gray-900'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'chat'   && <ChatSection />}
      {tab === 'disc'   && <DISCSection />}
      {tab === 'review' && <ReviewSection />}
      {tab === 'team'   && <TeamReviewSection />}
    </div>
  );
}
