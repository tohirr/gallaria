export const Image = ({ artist }) => {
  return (
    <div data-scroll-speed="4" data-scroll-section>
      <img
        className="object-cover"
        src={`/assets/images/${artist}.jpg`}
        alt=""
      />
    </div>
  );
};
