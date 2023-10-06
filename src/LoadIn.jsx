import { useState, useEffect } from "react";
import "./Loader.css"; // Create a CSS file for styling the loader

const Loader = () => {
  const [loading, setLoading] = useState(true);
  const [percentage, setPercentage] = useState(1);

  useEffect(() => {
    const interval = setInterval(() => {
      if (percentage < 100) {
        setPercentage(percentage + 1);
      } else {
        clearInterval(interval);
        setLoading(false);
      }
    }, 40); // Adjust the interval as needed for the desired speed

    return () => clearInterval(interval);
  }, [percentage]);

  return (
    <div
      className={` ${
        loading ? "opacity-1" : "opacity-0 pointer-events-none"
      } font-mono text-white absolute inset-0 w-screen h-screen  flex items-center justify-center bg-black z-50 transition-opacity ease-in-out duration-500`}
    >
      <div className="w-screen bg-white h-screen absolute">
        <div
          className="bg-black h-full transition-all ease-in-out duration-3000"
          style={{ height: `${percentage}%` }}
        ></div>
      </div>

      <div className="text-center ">
        <p className="text-[3rem] mix-blend-exclusion text-white">
          {percentage}%
        </p>
      </div>
    </div>
  );
};

export default Loader;
