const MODELS = {
  bvra: {
    name: "Specialist (215 classes)",
    size: "90 MB",
    path: "../model/fungitastic.onnx",
    labels: [
      "Agaricus altipes","Agaricus arvensis","Agaricus augustus","Agaricus bernardii",
      "Agaricus bisporus","Agaricus bitorquis","Agaricus bohusii","Agaricus brunneolus",
      "Agaricus campestris","Agaricus crocodilinus","Agaricus cupreobrunneus","Agaricus depauperatus",
      "Agaricus devoniensis","Agaricus dulcidulus","Agaricus essettei","Agaricus impudicus",
      "Agaricus langei","Agaricus lanipes","Agaricus litoralis","Agaricus moelleri",
      "Agaricus subfloccosus","Agaricus subperonatus","Agaricus sylvaticus","Agaricus sylvicola",
      "Agaricus xanthodermus","Amanita ceciliae","Amanita citrina","Amanita crocea",
      "Amanita franchetii","Amanita fulva","Amanita gemmata","Amanita huijsmanii",
      "Amanita lividopallescens","Amanita muscaria","Amanita olivaceogrisea","Amanita pantherina",
      "Amanita phalloides","Amanita porphyria","Amanita regalis","Amanita rubescens",
      "Amanita simulans","Amanita submembranacea","Amanita vaginata","Amanita virosa",
      "Boletus edulis","Boletus pinophilus","Boletus reticulatus","Clitocybe agrestis",
      "Clitocybe barbularum","Clitocybe diatreta","Clitocybe fragrans","Clitocybe metachroa",
      "Clitocybe nebularis","Clitocybe nebularis","Clitocybe nitrophila","Clitocybe obsoleta",
      "Clitocybe odora","Clitocybe phyllophila","Clitocybe rivulosa","Clitocybe subspadicea",
      "Clitocybe vibecina","Infundibulicybe costata","Mycena abramsii","Mycena acicula",
      "Mycena aetites","Mycena albidolilacea","Mycena amicta","Mycena arcangeliana",
      "Mycena aurantiomarginata","Mycena belliae","Mycena bulbosa","Mycena capillaripes",
      "Mycena chlorantha","Mycena cinerella","Mycena citrinomarginata","Mycena clavicularis",
      "Mycena clavularis","Mycena concolor","Mycena crocata","Mycena epipterygia",
      "Mycena erubescens","Mycena filopes","Mycena flavescens","Mycena galericulata",
      "Mycena galopus","Mycena haematopus","Mycena inclinata","Mycena juniperina",
      "Mycena latifolia","Mycena leptocephala","Mycena luteovariegata","Mycena maculata",
      "Mycena megaspora","Mycena meliigena","Mycena metata","Mycena mirata",
      "Mycena mucor","Mycena olivaceomarginata","Mycena pearsoniana","Mycena pelianthina",
      "Mycena pelliculosa","Mycena picta","Mycena polyadelpha","Mycena polygramma",
      "Mycena pseudocorticola","Mycena pseudopicta","Mycena pterigena","Mycena purpureofusca",
      "Mycena renati","Mycena rosea","Mycena rosella","Mycena rubromarginata",
      "Mycena sanguinolenta","Mycena scirpicola","Mycena silvae-nigrae","Mycena smithiana",
      "Mycena stipata","Mycena stylobates","Mycena tenerrima","Mycena tintinnabulum",
      "Mycena vitilis","Mycena vulgaris","Mycena xantholeuca","Mycena zephirus",
      "Russula acrifolia","Russula adusta","Russula aeruginea","Russula albonigra",
      "Russula alnetorum","Russula amoenolens","Russula anthracina","Russula aquosa",
      "Russula atrorubens","Russula aurea","Russula betularum","Russula brunneoviolacea",
      "Russula caerulea","Russula carpini","Russula cessans","Russula chloroides",
      "Russula claroflava","Russula clavipes","Russula cuprea","Russula curtipes",
      "Russula cyanoxantha","Russula decolorans","Russula delica","Russula densifolia",
      "Russula depallens","Russula emetica","Russula emeticicolor","Russula faginea",
      "Russula farinipes","Russula faustiana","Russula fellea","Russula foetens",
      "Russula fragilis","Russula globispora","Russula gracillima","Russula grata",
      "Russula graveolens","Russula grisea","Russula heterophylla","Russula illota",
      "Russula insignis","Russula integra","Russula ionochlora","Russula laccata",
      "Russula laeta","Russula lepida","Russula luteotacta","Russula maculata",
      "Russula mairei","Russula melliolens","Russula melzeri","Russula mustelina",
      "Russula nauseosa","Russula nigricans","Russula nitida","Russula ochroleuca",
      "Russula odorata","Russula olivacea","Russula paludosa","Russula parazurea",
      "Russula pelargonia","Russula pseudointegra","Russula puellaris","Russula puellula",
      "Russula queletii","Russula recondita","Russula rhodopus","Russula risigallina",
      "Russula romellii","Russula roseoaurantia","Russula sanguinea","Russula sardonia",
      "Russula seperina","Russula silvestris","Russula solaris","Russula sororia",
      "Russula subfoetens","Russula subrubens","Russula turci","Russula undulata",
      "Russula velenovskyi","Russula velutipes","Russula versicolor","Russula vesca",
      "Russula veternosa","Russula vinosa","Russula violeipes","Russula virescens",
      "Russula viscida","Russula xerampelina","Singerocybe phaeophthalma"
    ],
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    knowledge: KNOWLEDGE
  },
  dima806: {
    name: "General (100 classes)",
    size: "330 MB",
    path: "../model/dima806.onnx",
    labels: [
      "Urnula craterium","Leccinum albostipitatum","Lactarius deliciosus","Clitocybe nebularis",
      "Hypholoma fasciculare","Lactarius torminosus","Lycoperdon perlatum","Verpa bohemica",
      "Schizophyllum commune","Leccinum aurantiacum","Phellinus igniarius","Suillus luteus",
      "Coltricia perennis","Cetraria islandica","Amanita muscaria","Pholiota aurivella",
      "Trichaptum biforme","Artomyces pyxidatus","Calocera viscosa","Sarcosoma globosum",
      "Evernia prunastri","Laetiporus sulphureus","Lobaria pulmonaria","Bjerkandera adusta",
      "Vulpicida pinastri","Imleria badia","Evernia mesomorpha","Physcia adscendens",
      "Coprinellus micaceus","Armillaria borealis","Trametes ochracea","Cantharellus cibarius",
      "Pseudevernia furfuracea","Tremella mesenterica","Gyromitra infula","Leccinum versipelle",
      "Mutinus ravenelii","Pholiota squarrosa","Amanita rubescens","Amanita pantherina",
      "Sarcoscypha austriaca","Boletus edulis","Coprinus comatus","Merulius tremellosus",
      "Stropharia aeruginosa","Cladonia fimbriata","Suillus grevillei","Apioperdon pyriforme",
      "Cerioporus squamosus","Leccinum scabrum","Rhytisma acerinum","Hypholoma lateritium",
      "Flammulina velutipes","Tricholomopsis rutilans","Coprinopsis atramentaria","Trametes versicolor",
      "Graphis scripta","Ganoderma applanatum","Phellinus tremulae","Peltigera aphthosa",
      "Parmelia sulcata","Fomitopsis betulina","Pleurotus pulmonarius","Fomitopsis pinicola",
      "Daedaleopsis confragosa","Hericium coralloides","Trametes hirsuta","Coprinellus disseminatus",
      "Kuehneromyces mutabilis","Pleurotus ostreatus","Phlebia radiata","Boletus reticulatus",
      "Phallus impudicus","Macrolepiota procera","Fomes fomentarius","Suillus granulatus",
      "Gyromitra esculenta","Xanthoria parietina","Nectria cinnabarina","Sarcomyxa serotina",
      "Inonotus obliquus","Panellus stipticus","Hypogymnia physodes","Hygrophoropsis aurantiaca",
      "Cladonia rangiferina","Platismatia glauca","Calycina citrina","Cladonia stellaris",
      "Amanita citrina","Lepista nuda","Gyromitra gigas","Crucibulum laeve",
      "Daedaleopsis tricolor","Stereum hirsutum","Paxillus involutus","Lactarius turpis",
      "Chlorociboria aeruginascens","Chondrostereum purpureum","Phaeophyscia orbicularis","Peltigera praetextata"
    ],
    mean: [0.5, 0.5, 0.5],
    std: [0.5, 0.5, 0.5],
    knowledge: KNOWLEDGE_DIMA806
  }
};

let currentModel = "bvra";
let labels = MODELS.bvra.labels;
let knowledge = MODELS.bvra.knowledge;
let expectedLabelCount = MODELS.bvra.labels.length;

const worker = new Worker("js/worker.js", { type: "classic" });
let ready = false;

worker.onmessage = (e) => {
  const { type, text, logits, message, modelKey } = e.data;
  if (type === "status") {
    setStatus(text);
    if (text === "Ready" && modelKey === currentModel) {
      ready = true;
    }
  } else if (type === "result") {
    if (logits.length !== expectedLabelCount) {
      setStatus(`Label/logit mismatch: ${labels.length} labels vs ${logits.length} logits. Cannot display predictions safely.`);
      ready = false;
      return;
    }
    showResults(logits);
    setStatus("Done");
  } else if (type === "error") {
    setStatus("Error: " + message);
    ready = false;
  }
};

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function softmax(arr) {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] > max) max = arr[i];
  }
  const exps = new Float32Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = Math.exp(arr[i] - max);
    exps[i] = v;
    sum += v;
  }
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = exps[i] / sum;
  return out;
}

function showResults(logits) {
  const probs = softmax(logits);
  const ranked = [];
  for (let i = 0; i < probs.length; i++) {
    ranked.push({ label: labels[i], prob: probs[i], idx: i });
  }
  ranked.sort((a, b) => b.prob - a.prob);
  const top3 = ranked.slice(0, 3);

  const top1Prob = top3[0].prob;
  const hasPoisonousInTop3 = top3.some((item) => {
    const k = knowledge[item.label] || { edibility: "Unknown" };
    return k.edibility === "Poisonous";
  });

  const container = document.getElementById("predictions");
  container.innerHTML = "";

  const lowConf = document.getElementById("low-confidence");
  const warn = document.getElementById("warning");
  const know = document.getElementById("knowledge");

  lowConf.style.display = "none";
  warn.style.display = "none";
  know.style.display = "none";

  if (top1Prob < 0.5) {
    lowConf.textContent = "Low confidence — do not act on this prediction.";
    lowConf.style.display = "block";
  } else if (hasPoisonousInTop3 && top1Prob < 0.85) {
    warn.textContent = "Cannot rule out a toxic lookalike. Do not consume. Always verify with a certified expert.";
    warn.style.display = "block";
  }

  top3.forEach((item, rank) => {
    const k = knowledge[item.label] || { edibility: "Unknown", notes: "No data available." };
    const pct = (item.prob * 100).toFixed(1);
    const isPoison = k.edibility === "Poisonous";
    const isUnknown = k.edibility === "Unknown";
    const edClass = isPoison ? "poisonous" : isUnknown ? "unknown" : "edible";
    const edText = isPoison ? "POISONOUS" : isUnknown ? "Unknown" : "Edible";

    const div = document.createElement("div");
    div.className = "prediction";

    const labelDiv = document.createElement("div");
    labelDiv.className = "label";
    const nameDiv = document.createElement("div");
    nameDiv.style.fontWeight = "600";
    nameDiv.textContent = item.label;
    const edDiv = document.createElement("div");
    edDiv.className = edClass;
    edDiv.style.fontSize = "11px";
    edDiv.style.marginTop = "2px";
    edDiv.textContent = edText;
    labelDiv.appendChild(nameDiv);
    labelDiv.appendChild(edDiv);

    const barWrap = document.createElement("div");
    barWrap.className = "bar-wrap";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.width = pct + "%";
    barWrap.appendChild(bar);

    const pctDiv = document.createElement("div");
    pctDiv.className = "pct";
    pctDiv.textContent = pct + "%";

    div.appendChild(labelDiv);
    div.appendChild(barWrap);
    div.appendChild(pctDiv);
    container.appendChild(div);

    if (rank === 0) {
      const h3 = document.createElement("h3");
      h3.textContent = item.label;
      const p = document.createElement("p");
      p.textContent = k.notes;
      know.innerHTML = "";
      know.appendChild(h3);
      know.appendChild(p);
      know.style.display = "block";

      if (isPoison && top1Prob >= 0.5) {
        warn.textContent = "This prediction indicates a potentially poisonous species. Do not consume. Always verify with a certified expert.";
        warn.style.display = "block";
      } else if (isUnknown && top1Prob >= 0.5) {
        warn.textContent = "Edibility unknown or unverified for this species. Do not consume without positive identification by a certified mycologist.";
        warn.style.display = "block";
      }
    }
  });
}

function switchModel(key) {
  if (!MODELS[key]) return;
  currentModel = key;
  labels = MODELS[key].labels;
  knowledge = MODELS[key].knowledge;
  expectedLabelCount = labels.length;
  ready = false;
  document.getElementById("predictions").innerHTML = "";
  document.getElementById("knowledge").style.display = "none";
  document.getElementById("warning").style.display = "none";
  document.getElementById("low-confidence").style.display = "none";
  worker.postMessage({ type: "switch", modelPath: MODELS[key].path, modelKey: key, mean: MODELS[key].mean, std: MODELS[key].std });
  setStatus(`Loading ${MODELS[key].name}...`);
}

async function startCamera() {
  const video = document.getElementById("video");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = stream;
    await video.play();
    setStatus("Camera active. Tap shutter to identify.");
    document.getElementById("camera-error").style.display = "none";
  } catch (err) {
    setStatus("Camera error: " + err.message);
    document.getElementById("camera-error").style.display = "block";
  }
}

function capture() {
  if (!ready) {
    setStatus("Model still loading...");
    return;
  }
  const video = document.getElementById("video");
  const size = 224;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const v = video;
  const sz = Math.min(v.videoWidth, v.videoHeight);
  const sx = (v.videoWidth - sz) / 2;
  const sy = (v.videoHeight - sz) / 2;
  ctx.drawImage(v, sx, sy, sz, sz, 0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const buffer = imageData.data.buffer;
  worker.postMessage({ type: "infer", pixels: buffer, width: size, height: size }, [buffer]);
  setStatus("Processing...");
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    const size = 224;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const sz = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - sz) / 2;
    const sy = (img.naturalHeight - sz) / 2;
    ctx.drawImage(img, sx, sy, sz, sz, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const buffer = imageData.data.buffer;
    worker.postMessage({ type: "infer", pixels: buffer, width: size, height: size }, [buffer]);
    setStatus("Processing...");
  };
  img.src = URL.createObjectURL(file);
}

function registerSW() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => {
      console.error("SW registration failed", err);
    });
  }
}

function updateOnline() {
  const badge = document.getElementById("badge");
  badge.textContent = navigator.onLine ? "Online" : "Offline";
  badge.style.color = navigator.onLine ? "var(--accent)" : "var(--warn)";
}

window.addEventListener("load", () => {
  registerSW();
  startCamera();
  updateOnline();

  const sel = document.getElementById("model-select");
  if (sel) {
    sel.addEventListener("change", (e) => switchModel(e.target.value));
  }
  // Load default model unconditionally
  worker.postMessage({ type: "switch", modelPath: MODELS.bvra.path, modelKey: "bvra", mean: MODELS.bvra.mean, std: MODELS.bvra.std });

  const fileInput = document.getElementById("file-input");
  if (fileInput) {
    fileInput.addEventListener("change", handleFileSelect);
  }
  const retryBtn = document.getElementById("camera-retry");
  if (retryBtn) {
    retryBtn.addEventListener("click", startCamera);
  }
});

window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);

document.getElementById("capture-btn").addEventListener("click", capture);
