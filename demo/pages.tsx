import { useEffect, useRef, useState } from 'react';

function Cover() {
  return (
    <article className="page cover">
      <div className="cover-art" aria-hidden="true">
        <svg viewBox="0 0 200 200" role="presentation">
          <defs>
            <linearGradient id="sun" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#ffd27a" />
              <stop offset="1" stopColor="#ff7a59" />
            </linearGradient>
          </defs>
          <circle cx="100" cy="92" r="46" fill="url(#sun)" />
          <path d="M0 140 Q50 110 100 138 T200 132 V200 H0Z" fill="#20435c" />
          <path d="M0 158 Q60 136 120 160 T200 154 V200 H0Z" fill="#14304a" />
        </svg>
      </div>
      <p className="eyebrow">A field guide</p>
      <h1>Coastlines</h1>
      <p className="byline">Twelve pages of tides, maps and small instruments</p>
    </article>
  );
}

function Contents() {
  const items = [
    'Low tide',
    'Reading a chart',
    'Field notes',
    'Instruments',
    'Log book',
    'Colophon',
  ];
  return (
    <article className="page">
      <h2>Contents</h2>
      <ol className="toc">
        {items.map((item, i) => (
          <li key={item}>
            <span>{item}</span>
            <span className="dots" />
            <span>{i * 2 + 3}</span>
          </li>
        ))}
      </ol>
      <p className="note">Drag a corner, click near an edge, or use the arrow keys.</p>
    </article>
  );
}

function Essay() {
  return (
    <article className="page">
      <p className="eyebrow">Chapter one</p>
      <h2>Low tide</h2>
      <p className="lede">
        Twice a day the sea pulls back and leaves a strip of country that belongs to no one. It is
        the best place to learn how a coast is put together.
      </p>
      <p>
        Start at the wrack line, where the last high water dropped its weed and driftwood. Walk
        seaward and the sand firms up underfoot, ripples appear, and the pools begin. Each pool is a
        small, warm, salty world that will be drowned again in six hours.
      </p>
      <blockquote>The tide is the only clock the shore keeps.</blockquote>
      <p>
        Go slowly. Turn stones and put them back the way you found them. Most of what lives here
        hides from the light.
      </p>
    </article>
  );
}

function Chart() {
  const heights = [1.2, 2.8, 4.1, 4.6, 3.9, 2.4, 1.1, 0.6, 1.4, 3.0, 4.3, 4.8];
  return (
    <article className="page">
      <p className="eyebrow">Chapter two</p>
      <h2>Reading a chart</h2>
      <p>
        Tide height over one day, in metres. Two highs, two lows, a little over twelve hours apart.
      </p>
      <svg className="chart" viewBox="0 0 240 140" role="img" aria-label="Tide heights">
        {heights.map((h, i) => (
          <rect key={h} x={8 + i * 19.5} y={120 - h * 22} width="13" height={h * 22} rx="3" />
        ))}
        <line x1="0" x2="240" y1="120.5" y2="120.5" />
      </svg>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Time</th>
            <th>Height</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>High</td>
            <td>03:12</td>
            <td>4.6 m</td>
          </tr>
          <tr>
            <td>Low</td>
            <td>09:31</td>
            <td>0.6 m</td>
          </tr>
          <tr>
            <td>High</td>
            <td>15:40</td>
            <td>4.8 m</td>
          </tr>
        </tbody>
      </table>
    </article>
  );
}

function Sketch() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const w = 560;
    const h = 360;
    canvas.width = w;
    canvas.height = h;
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#9ed8f0');
    sky.addColorStop(1, '#f6e7c8');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    for (let band = 0; band < 5; band++) {
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        g.lineTo(x, 190 + band * 34 + Math.sin(x / (40 + band * 9) + band) * (14 - band * 2));
      }
      g.lineTo(w, h);
      g.fillStyle = `hsl(${200 - band * 6} 55% ${46 - band * 7}%)`;
      g.fill();
    }
    g.fillStyle = '#fff8';
    for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, 200 + ((i * 53) % 140), 10, 2);
  }, []);
  return (
    <article className="page">
      <p className="eyebrow">Plate I</p>
      <h2>Swell at dusk</h2>
      <canvas ref={ref} className="sketch" />
      <p className="caption">
        Drawn into a &lt;canvas&gt; at load time. The curl copies its pixels.
      </p>
    </article>
  );
}

function Notes() {
  const [count, setCount] = useState(3);
  return (
    <article className="page">
      <p className="eyebrow">Chapter three</p>
      <h2>Field notes</h2>
      <label className="field">
        Location
        <input defaultValue="North beach, below the light" />
      </label>
      <label className="field">
        Conditions
        <select defaultValue="calm">
          <option value="calm">Calm, light westerly</option>
          <option value="rough">Rough</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" defaultChecked /> Spring tide
      </label>
      <div className="counter">
        <span>Crabs counted</span>
        <button type="button" onClick={() => setCount((c) => c + 1)}>
          {count}
        </button>
      </div>
      <p className="caption">
        Change these, then turn the page: the curl always shows the page as it is now.
      </p>
    </article>
  );
}

function Instruments() {
  const tools = [
    ['🧭', 'Compass', 'A baseplate compass, for bearings off headlands.'],
    ['🔭', 'Glass', 'Eight-power binoculars, for birds and buoys.'],
    ['⏱️', 'Watch', 'For timing the swell between sets.'],
    ['📓', 'Notebook', 'Waterproof paper and a pencil, never a pen.'],
  ];
  return (
    <article className="page">
      <p className="eyebrow">Chapter four</p>
      <h2>Instruments</h2>
      <ul className="tools">
        {tools.map(([icon, name, text]) => (
          <li key={name}>
            <span className="icon">{icon}</span>
            <div>
              <strong>{name}</strong>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Log() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <article className="page">
      <p className="eyebrow">Chapter five</p>
      <h2>Log book</h2>
      <div className="clock">{now.toLocaleTimeString()}</div>
      <p className="caption">This clock ticks live. Each turn curls whatever second it shows.</p>
      <ul className="entries">
        <li>
          <time>06:40</time> Fog lifting off the point.
        </li>
        <li>
          <time>07:15</time> Seals hauled out on the bar.
        </li>
        <li>
          <time>08:02</time> First set over the reef.
        </li>
      </ul>
    </article>
  );
}

function Colophon() {
  return (
    <article className="page cover back">
      <h2>Colophon</h2>
      <p>
        Every page here is plain HTML and CSS. Nothing is pre-rendered: the curl takes a snapshot of
        the page as it turns.
      </p>
      <p className="eyebrow">Thanks for reading</p>
    </article>
  );
}

function Blank({ label }: { label: string }) {
  return (
    <article className="page blank">
      <p>{label}</p>
    </article>
  );
}

export function bookPages() {
  return [
    <Cover key="cover" />,
    <Contents key="contents" />,
    <Essay key="essay" />,
    <Chart key="chart" />,
    <Sketch key="sketch" />,
    <Notes key="notes" />,
    <Instruments key="instruments" />,
    <Log key="log" />,
    <Blank key="blank-1" label="Notes" />,
    <Blank key="blank-2" label="Notes" />,
    <Blank key="blank-3" label="Notes" />,
    <Colophon key="colophon" />,
  ];
}
