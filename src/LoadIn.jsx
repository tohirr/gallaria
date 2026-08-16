/* eslint-disable react/prop-types */

// Intro loader driven by real progress (0..1) — catalog fetch + first thumbs.
const Loader = ({ progress }) => {
  const pct = Math.round(Math.min(1, progress) * 100);
  const done = progress >= 1;

  return (
    <div
      className={`${
        done ? "opacity-0 pointer-events-none" : "opacity-1"
      } font-mono text-white fixed inset-0 w-screen h-screen flex items-center justify-center bg-black z-50 transition-opacity ease-in-out duration-500`}
    >
      <div className="w-screen bg-white h-screen absolute">
        <div
          className="bg-black transition-[height] ease-out duration-300"
          style={{ height: `${pct}%` }}
        ></div>
      </div>

      <div className="text-center">
        <p className="text-[3rem] mix-blend-exclusion text-white">{pct}%</p>
      </div>
    </div>
  );
};

export default Loader;
