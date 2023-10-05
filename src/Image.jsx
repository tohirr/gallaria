/* eslint-disable react/prop-types */
export const Image = ({ artist }) => {
  return (
    <div className="overflow-hidden flex items-center justify-center relative">
      <a
        href={`https://twitter.com/${artist}`}
        className="absolute bottom-5 z-20 right-5 font-mono mix-blend-exclusion bold text-white underline"
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
    </div>
  );
};
