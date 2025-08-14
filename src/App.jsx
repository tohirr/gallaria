import { useState } from "react";
import { useEffect } from "react";

const App = () => {
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

  const [selectedImg, setSelectedImg] = useState(null);

  useEffect(() => {
    const masonry = document.querySelector("masonry-grid");
    const imgs = Array.from(document.querySelectorAll("masonry-grid img"));

    if (!masonry || imgs.length === 0) return;

    Promise.all(
      imgs.map(
        (img) =>
          new Promise((resolve, reject) => {
            if (img.complete) return resolve();
            img.onload = resolve;
            img.onerror = reject;
          })
      )
    ).then(() => {
      imgs.forEach((img) => (img.style.visibility = "visible"));
      masonry.layout();
    });
  }, [artists]);

  return (
    <>
      <masonry-grid>
        {artists.map((artiste, index) => (
          <img
            style={{ visibility: "hidden", cursor: "pointer" }}
            key={index}
            src={`/assets/images/${artiste}.jpg`}
            onClick={() => setSelectedImg(`/assets/images/${artiste}.jpg`)}
          />
        ))}
      </masonry-grid>

      {/* Modal */}
      {selectedImg && (
        <div className="modal-overlay" onClick={() => setSelectedImg(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImg} alt="Preview" />
          </div>
        </div>
      )}
    </>
  );
};

export default App;
