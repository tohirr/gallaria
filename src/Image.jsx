/* eslint-disable react/prop-types */
export const Image = ({ artist }) => {
  return (
    <div
      data-scroll-section
      className="overflow-hidden flex items-center justify-center"
    >
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
