import { useRef } from "react";
import { LocomotiveScrollProvider } from "react-locomotive-scroll";
// import { Image } from "./Image";
const App = () => {
  const containerRef = useRef(null);

  return (
    <LocomotiveScrollProvider
      options={{
        inertia: 0.8,
        smooth: true,
        getDirection: true,
        mobile: {
          inertia: 0.8,
          smooth: true,
          getDirection: true,
        },
        tablet: {
          inertia: 0.8,
          smooth: true,
          getDirection: true,
        },
      }}
      watch={
        [
          //..all the dependencies you want to watch to update the scroll.
          //  Basicaly, you would want to watch page/location changes
          //  For exemple, on Next.js you would want to watch properties like `router.asPath` (you may want to add more criterias if the instance should be update on locations with query parameters)
        ]
      }
      containerRef={containerRef}
    >
      <main data-scroll-container ref={containerRef}>
        <div
          data-scroll-section
          className="flex flex-col lg:flex-row max-w-[100vw]"
        >
          <div className="flex-1">
            <div className="">
              <img
                className="object-cover"
                src="/assets/images/011FO110.jpg"
                alt=""
              />
            </div>
            <div className="">
              <img
                className="object-cover"
                src="/assets/images/Xeunbadejo.jpg"
                alt=""
              />
            </div>
            <img
              className="object-cover"
              src="/assets/images/1Segun1.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/_eunice_ukamaka.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/NenjiKami.jpg"
              alt=""
            />
            <div className="overflow-hidden flex items-center justify-center">
              <img
                data-scroll
                data-scroll-class="scale-100 transition-transform duration-4000"
                data-scroll-repeat="true"
                className="object-cover scale-150 "
                src="/assets/images/mallyxl.jpg"
                alt=""
              />
            </div>

            <img
              className="object-cover"
              src="/assets/images/zomvilien.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/9GreenRats.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/TOBYDPHOTOGRAPH.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/Strixme_2.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/Powellgraham5.jpg"
              alt=""
            />
          </div>
          <div className="flex-1">
            <img
              className="object-cover "
              src="/assets/images/_AdewaleMayowas.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/jisticslawal.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/_AdewaleMayowa.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/Anny_Inferno.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/Anjoladave.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/AkpomedayeT.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/Akanevans13.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/Adxnna.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/AdjoaFaakye.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/arrestingyellow.jpg"
              alt=""
            />
            <img
              className="object-cover "
              src="/assets/images/AnthonyAzekwoh.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/afrogodd.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/UfotUbon.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/therisinggemini.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/the_Kingtesh.jpg"
              alt=""
            />
            <img
              className="object-cover"
              src="/assets/images/_vickson_.jpg"
              alt=""
            />
          </div>
        </div>
      </main>
    </LocomotiveScrollProvider>
  );
};

export default App;
