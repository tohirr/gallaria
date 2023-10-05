/* eslint-disable react/prop-types */
export const Image = ({ artist }) => {
  return (
    <div className="overflow-hidden flex items-center justify-center sticky top-0">
      <img
        className="object-cover"
        src={`/assets/images/${artist}.jpg`}
        alt=""
      />
    </div>
  );
};
