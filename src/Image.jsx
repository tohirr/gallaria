/* eslint-disable react/prop-types */
export const Image = ({ artist }) => {
  return (
    <div className="overflow-hidden flex items-center justify-center relative">
      <a
        href={`https://twitter.com/${artist}`}
        className="absolute top-5 z-20 left-5 font-mono text-white mix-blend-exclusion underline"
      >
        @{artist}
      </a>
      <img
        data-scroll
        data-scroll-class="fadeIn"
        className="object-cover opacity-40 scale-100"
        src={`/assets/images/${artist}.jpg`}
        alt=""
      />
      <div className="text-[1rem] absolute bottom-0 right-0 py-2 px-4 gap-2 rounded-tl-lg bg-white border-t border-r  z-20  font-mono flex ">
        <img src="/assets/Star.svg" /> 16
      </div>
    </div>
  );
};
