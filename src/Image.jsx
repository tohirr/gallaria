/* eslint-disable react/prop-types */
export const Image = ({ artist }) => {
  return (
    <div className="overflow-hidden flex rounded-xl my-2 lg:my-4 items-center justify-center relative">
      <a
        href={`https://twitter.com/${artist}`}
        className="absolute lg:top-3 z-20 lg:left-4 top-2 left-2   text-xs lg:text-base font-mono text-white mix-blend-exclusion underline"
      >
        @{artist}
      </a>
      <img
        className="object-cover"
        src={`/assets/images/${artist}.jpg`}
        alt=""
      />
    </div>
  );
};
