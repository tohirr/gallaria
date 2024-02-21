// import { LocomotiveScrollProvider } from "react-locomotive-scroll";
// import AnimatedCursor from "react-animated-cursor";
import { Image } from "./Image";
import { useRef } from "react";
import { useState } from "react";
import { useEffect } from "react";
import Loader from "./LoadIn";

const App = () => {
  const ref = useRef(null);
  const [loadingComplete, setLoadingComplete] = useState(false);

  useEffect(() => {
    // Simulate an asynchronous loading process (e.g., fetching data) here.
    // Once loading is complete, set setLoadingComplete to true.
    setTimeout(() => {
      setLoadingComplete(true);
    }, 4650); // Simulate loading for 3 seconds (adjust as needed).
  }, []);

  const options = {
    smooth: true,
    inertia: 0.9,
    mobile: {
      smooth: true,
    },
    tablet: {
      smooth: true,
    },
  };
  const artists = [
    "AnthonyAzekwoh2",
    "mumu_illustratr",
    "Arclighttt",
    "arrestingyellow",
    "ayanfee__",
    "ChukwuAdaeze",
    "chukwuadaeze_",
    "bad_oats",
    "bolusowoolu",
    "castroadefisayo",
    "ChidimmaNwafor_",
    "akachinonyerem_",
    "Akanevans13",
    "AkpomedayeT",
    "Anjoladave",
    "AnthonyAzekwoh",
    "artnerdx",
    "aok_vii",
    "Anny_Inferno",
    "ArtObosa_",
    "artofnuel",
    "art_by_jacinta",
    "Asamaiige",
    "avatarbmb",
    "diiackermann",
    "Chiebuniem_",
    "ChigozieObi_",
    "ChisaLinto",
    "ayoguofficial",
    "kehinde_bb",
    "Delkrapht",
    "deoluphotograph",
    "Desss_chiiii",
    "drealstephen",
    "011FO110",
    "1Segun1",
    "24kstxxz",
    "9GreenRats",
    "AdjoaFaakye",
    "Adxnna",
    "afrogodd",
    "dumsurfer88",
    "F7nOswRWgAA3IoQ",
    "F7ohRnoXMAAvJsG",
    "fadeadefolalu",
    "fatileee",
    "freddiejacobart",
    "fuckinghelloyin",
    "gangster__B",
    "grizzygrae",
    "huesofgigi",
    "iamrenike",
    "iamrenike2",
    "idrisanjola",
    "imanie",
    "imit0r",
    "Im_Aishat",
    "Isiomah2",
    "Jekeinism",
    "jisticslawal",
    "khay_szn",
    "kosithecreator",
    "kunle_paints",
    "Looooohiiiii",
    "Lucynder_",
    "LUDA_JOSH",
    "mallyxl",
    "miprox_",
    "mister_gamal",
    "moboxx___",
    "Mohd_Sodq",
    "NengusArts",
    "NenjiKami",
    "nkfrom04",
    "obohdraws",
    "OhabTBJ",
    "OlaAgunbiade",
    "olaoluart",
    "Olutoyosi_",
    "Omoteniola_",
    "Powellgraham5",
    "Prescribed_FOB",
    "Romigenic",
    "SamuelOlowomeye",
    "slimmwrites",
    "Strixme",
    "Strixme_2",
    "theartist_Nicol",
    "therisinggemini",
    "the_Kingtesh",
    "TOBYDPHOTOGRAPH",
    "Tolu__c",
    "UfotUbon",
    "ukay_gold",
    "umiamara",
    "Xeunbadejo",
    "Yinkore_",
    "zomvilien",
    "_AdewaleMayowa",
    "_Dvrmvc",
    "_eunice_ukamaka",
    "_taiwolasisi",
    "_vickson_",
  ];

  console.log(artists.length);
  return (
    <>
      {/* <AnimatedCursor /> */}
      {loadingComplete ? (
        // Render your home page component when loading is complete.
          <main >
            <div className="columns-3xs gap-2 lg:gap-4 p-2 lg:p-4">
                {artists.map(
                  (artiste, index) =>
                    <Image key={index} artist={artiste} />
                )}
              </div>
          </main>
      ) : (
        // Render the Loader component while loading is in progress.
        <Loader />
      )}
    </>
  );
};

export default App;
