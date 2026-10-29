import { defineMessages } from "../../i18n";

export const m = defineMessages({
  // Category groups
  groupTextSound: {
    en: "The clean fraction, reported as purity %.",
    hi: "साफ़ हिस्सा, जिसे शुद्धता % के रूप में बताया जाता है।",
  },
  groupTextAdmixture: {
    en: "Other cereals, for example barley, rye, oats or triticale in wheat.",
    hi: "दूसरे अनाज, जैसे गेहूँ में जौ, राई, जई या ट्रिटिकेल।",
  },
  groupTextBrokenDefective: {
    en: "Broken, shrivelled, sprouted, heat-damaged and pest-damaged kernels.",
    hi: "टूटे, सिकुड़े, अंकुरित, गर्मी से और कीट से क्षतिग्रस्त दाने।",
  },
  groupTextImpurity: {
    en: "Weed and foreign seeds, husks, plant parts, stones and debris.",
    hi: "खरपतवार व अन्य बीज, भूसी, पौधों के भाग, कंकड़-पत्थर और कचरा।",
  },
  groupTextHarmful: {
    en: "Ergot, sclerotia, Fusarium-damaged and mouldy kernels.",
    hi: "अरगट, स्क्लेरोशिया, फ्यूज़ेरियम से क्षतिग्रस्त और फफूंदयुक्त दाने।",
  },
  categoryTitle: {
    en: "The physical side of grain quality",
    hi: "अनाज की गुणवत्ता का भौतिक पहलू",
  },
  categoryText: {
    en: "Every object on the board is detected and classified, and every number in the report ties back to a kernel in the photo. Classes follow the grouping of EN 15587 impurity (Besatz) analysis, and you configure them per crop.",
    hi: "बोर्ड पर रखी हर चीज़ पहचानी और वर्गीकृत की जाती है, और रिपोर्ट का हर आँकड़ा फ़ोटो के किसी दाने से जुड़ा होता है। वर्ग EN 15587 अशुद्धि (Besatz) विश्लेषण के समूहों पर आधारित हैं, और आप इन्हें हर फसल के लिए अलग तय करते हैं।",
  },
  categoryNote: {
    en: "Each crop has its own classes: about 14–17 in the presets.",
    hi: "हर फसल के अपने वर्ग हैं: तैयार सूचियों में लगभग 14–17।",
  },
  glossary: { en: "Glossary", hi: "शब्दावली" },

  // Crops
  cropsTitle: {
    en: "Class lists for every crop",
    hi: "हर फसल के लिए वर्ग सूची",
  },
  cropsText: {
    en: "Each crop has its own classes and descriptions, which Claude uses to judge kernels. Edit the presets, or add any crop with its own classes.",
    hi: "हर फसल के अपने वर्ग और विवरण हैं, जिनसे Claude दानों को परखता है। तैयार सूचियाँ बदलें, या अपने वर्गों के साथ कोई भी फसल जोड़ें।",
  },
  classCount_one: { en: "{count} class", hi: "{count} वर्ग" },
  classCount_other: { en: "{count} classes", hi: "{count} वर्ग" },
  yourCrop: { en: "Your crop", hi: "आपकी फसल" },
  yourCropText: {
    en: "Define its classes in the app",
    hi: "इसके वर्ग ऐप में तय करें",
  },
  exploreDemo: {
    en: "Explore a sample in the demo",
    hi: "डेमो में एक नमूना देखें",
  },

  // Case studies
  resultsTitle: { en: "Results from the field", hi: "ज़मीनी नतीजे" },

  // Hero
  eyebrow: {
    en: "AI-assisted grain impurity analysis",
    hi: "AI की मदद से अनाज अशुद्धि विश्लेषण",
  },
  heroTitle: {
    en: "Grain quality screening with a phone, a scale and Claude",
    hi: "फ़ोन, तराज़ू और Claude से अनाज की गुणवत्ता जाँच",
  },
  heroLead: {
    en: "Photograph a sample on a grid board. Claude flags every suspect kernel, a person confirms it, and the scale gives the mass percentage. You get a grade and a report anyone can verify, for about US$50 of equipment on top of a phone.",
    hi: "ग्रिड बोर्ड पर रखे नमूने की फ़ोटो लें। Claude हर संदिग्ध दाने को चिह्नित करता है, एक व्यक्ति उसकी पुष्टि करता है, और तराज़ू से वज़न प्रतिशत मिलता है। फ़ोन के अलावा लगभग US$50 के उपकरण में आपको ग्रेड और ऐसी रिपोर्ट मिलती है जिसे कोई भी सत्यापित कर सके।",
  },
  tryDemo: { en: "Try the demo analysis", hi: "डेमो विश्लेषण आज़माएँ" },
  talkToUs: { en: "Talk to us", hi: "हमसे बात करें" },

  // Steps
  stepsTitle: {
    en: "Simple process, documented result",
    hi: "आसान प्रक्रिया, दर्ज नतीजा",
  },
  step1Title: { en: "Weigh and spread", hi: "तौलें और फैलाएँ" },
  step1Text: {
    en: "Weigh the working sample on a 0.01 g scale, then spread 100–150 kernels per batch on a 1 cm grid board.",
    hi: "काम के नमूने को 0.01 g वाले तराज़ू पर तौलें, फिर हर बैच में 100–150 दाने 1 cm ग्रिड बोर्ड पर फैलाएँ।",
  },
  step2Title: { en: "Photograph", hi: "फ़ोटो लें" },
  step2Text: {
    en: "Take a straight-down photo with the phone. The app corrects perspective and finds every kernel by image processing.",
    hi: "फ़ोन से ठीक ऊपर से फ़ोटो लें। ऐप तिरछापन ठीक करता है और इमेज प्रोसेसिंग से हर दाना ढूँढता है।",
  },
  step3Title: { en: "AI analysis", hi: "AI विश्लेषण" },
  step3Text: {
    en: "Claude classifies a close-up of each kernel into your crop's classes, with a confidence and a reason.",
    hi: "Claude हर दाने की नज़दीकी तस्वीर को आपकी फसल के वर्गों में बाँटता है, भरोसे के स्तर और कारण के साथ।",
  },
  step4Title: { en: "Verified report", hi: "सत्यापित रिपोर्ट" },
  step4Text: {
    en: "You check the flagged kernels and weigh the cups. The grade, purity and a QR-verifiable report follow.",
    hi: "आप चिह्नित दाने जाँचते हैं और कप तौलते हैं। फिर ग्रेड, शुद्धता और QR से सत्यापित होने वाली रिपोर्ट मिलती है।",
  },

  // Compare
  compareTitle: {
    en: "From slow and subjective to fast and documented",
    hi: "धीमी और व्यक्तिगत अंदाज़े वाली जाँच से तेज़ और दर्ज जाँच तक",
  },
  manualTitle: { en: "Manual inspection", hi: "हाथ से जाँच" },
  manual1: {
    en: "A trained grader sorts the sample by eye, kernel by kernel",
    hi: "प्रशिक्षित ग्रेडर आँख से एक-एक दाना छाँटता है",
  },
  manual2: {
    en: "Results depend on the person and the time of day",
    hi: "नतीजे व्यक्ति और दिन के समय पर निर्भर करते हैं",
  },
  manual3: {
    en: "Paper notes; hard to show a buyer how a figure was reached",
    hi: "काग़ज़ी नोट; ख़रीदार को दिखाना मुश्किल कि आँकड़ा कैसे निकला",
  },
  manual4: {
    en: "Each sample ties up an expert for 15–30 minutes",
    hi: "हर नमूने में विशेषज्ञ के 15–30 मिनट लगते हैं",
  },
  withAiTitle: { en: "With AI-Grain", hi: "AI-Grain के साथ" },
  withAi1: {
    en: "Claude flags suspect kernels; an operator only checks the flagged ones",
    hi: "Claude संदिग्ध दाने चिह्नित करता है; ऑपरेटर सिर्फ़ चिह्नित दाने जाँचता है",
  },
  withAi2: {
    en: "The same definitions and reference images every time",
    hi: "हर बार वही परिभाषाएँ और संदर्भ चित्र",
  },
  withAi3: {
    en: "Every figure ties back to a kernel image, with a verifiable report",
    hi: "हर आँकड़ा दाने की तस्वीर से जुड़ा, सत्यापित होने वाली रिपोर्ट के साथ",
  },
  withAi4: {
    en: "Any trained operator can run it with a phone and a scale",
    hi: "कोई भी प्रशिक्षित ऑपरेटर फ़ोन और तराज़ू से इसे चला सकता है",
  },

  // Features
  featuresTitle: { en: "What you get", hi: "आपको क्या मिलता है" },
  feature1Title: {
    en: "Weighing or instant estimate",
    hi: "तौल या तुरंत अनुमान",
  },
  feature1Text: {
    en: "The scale gives the verified result. An estimate from kernel areas is ready as soon as Claude has classified the photos, for fast pre-checks.",
    hi: "तराज़ू से सत्यापित नतीजा मिलता है। Claude के फ़ोटो वर्गीकृत करते ही दानों के क्षेत्रफल से अनुमान तैयार हो जाता है, तेज़ पूर्व-जाँच के लिए।",
  },
  feature2Title: {
    en: "Reports anyone can verify",
    hi: "ऐसी रिपोर्ट जिसे कोई भी सत्यापित कर सके",
  },
  feature2Text: {
    en: "Completed samples get a certificate code and QR code. Anyone can check the figures online, and any change shows.",
    hi: "पूरे हुए नमूनों को प्रमाणपत्र कोड और QR कोड मिलता है। कोई भी आँकड़े ऑनलाइन जाँच सकता है, और कोई भी बदलाव दिख जाता है।",
  },
  feature3Title: {
    en: "Kernel-level transparency",
    hi: "हर दाने तक पारदर्शिता",
  },
  feature3Text: {
    en: "The report includes the image of every kernel not judged sound, with Claude's class, its confidence and the operator's decision.",
    hi: "रिपोर्ट में हर उस दाने की तस्वीर होती है जो स्वस्थ नहीं माना गया, साथ में Claude का वर्ग, उसका भरोसा और ऑपरेटर का निर्णय।",
  },
  feature4Title: { en: "Analytics", hi: "विश्लेषण" },
  feature4Text: {
    en: "Throughput, grades and defect trends by source, how often operators change Claude's verdicts, and how the photo estimate compares with the scale.",
    hi: "स्रोत के अनुसार जाँचों की संख्या, ग्रेड और दोषों का रुझान, ऑपरेटर कितनी बार Claude का फ़ैसला बदलते हैं, और फ़ोटो अनुमान तराज़ू से कितना मेल खाता है।",
  },
  feature5Title: { en: "Your standards", hi: "आपके मानक" },
  feature5Text: {
    en: "Grade limits per class and per group, from the standard you grade against. Nothing official is built in or assumed.",
    hi: "हर वर्ग और हर समूह की ग्रेड सीमाएँ, उस मानक से जिसके अनुसार आप ग्रेड करते हैं। कोई आधिकारिक सीमा पहले से डाली या मानी नहीं जाती।",
  },
  feature6Title: { en: "Team accounts", hi: "टीम खाते" },
  feature6Text: {
    en: "Admins, graders and viewers, invitations, password reset, and an activity log.",
    hi: "व्यवस्थापक, ग्रेडर और दर्शक, आमंत्रण, पासवर्ड रीसेट और गतिविधि लॉग।",
  },

  // Equipment
  equipmentTitle: { en: "Equipment", hi: "उपकरण" },
  item: { en: "Item", hi: "सामान" },
  specification: { en: "Specification", hi: "विवरण" },
  cost: { en: "Approx. cost (USD)", hi: "अनुमानित लागत (USD)" },
  phone: { en: "Mobile phone", hi: "मोबाइल फ़ोन" },
  phoneSpec: {
    en: "Any recent Android or iPhone, 12 MP or better",
    hi: "कोई भी नया Android या iPhone, 12 MP या बेहतर",
  },
  existing: { en: "existing", hi: "पहले से मौजूद" },
  scale: { en: "Scale", hi: "तराज़ू" },
  scaleSpec: {
    en: "Pocket or jewellery scale, 0.01 g resolution, 100–200 g capacity",
    hi: "पॉकेट या ज्वेलरी तराज़ू, 0.01 g सटीकता, 100–200 g क्षमता",
  },
  board: { en: "Background board", hi: "पृष्ठभूमि बोर्ड" },
  boardSpec: {
    en: "Matte black or dark blue A4 card, printed 1 cm grid, columns A–T, rows 1–28",
    hi: "मैट काला या गहरा नीला A4 कार्ड, छपा हुआ 1 cm ग्रिड, कॉलम A–T, पंक्तियाँ 1–28",
  },
  stand: { en: "Phone stand", hi: "फ़ोन स्टैंड" },
  standSpec: {
    en: "Holds the phone flat, 20–25 cm above the board",
    hi: "फ़ोन को बोर्ड से 20–25 cm ऊपर सीधा थामता है",
  },
  lighting: { en: "Lighting", hi: "रोशनी" },
  lightingSpec: {
    en: "LED ring light, or two desk lamps at 45°",
    hi: "LED रिंग लाइट, या 45° पर दो टेबल लैंप",
  },
  tweezers: { en: "Tweezers and cups", hi: "चिमटी और कप" },
  tweezersSpec: {
    en: "One cup per defect class",
    hi: "हर दोष वर्ग के लिए एक कप",
  },

  // FAQ
  faqTitle: {
    en: "Frequently asked questions",
    hi: "अक्सर पूछे जाने वाले सवाल",
  },
  faq1Q: { en: "Who is it for?", hi: "यह किसके लिए है?" },
  faq1A: {
    en: "Farms, intake points, elevators, mills, traders, cooperatives, seed companies and training labs that want a fast, documented pre-check of grain impurities without a dedicated grading machine.",
    hi: "खेत, ख़रीद केंद्र, गोदाम, मिलें, व्यापारी, सहकारी समितियाँ व FPO, बीज कंपनियाँ और प्रशिक्षण प्रयोगशालाएँ, जिन्हें अलग ग्रेडिंग मशीन के बिना अनाज की अशुद्धियों की तेज़ और दर्ज पूर्व-जाँच चाहिए।",
  },
  faq2Q: { en: "Which crops does it handle?", hi: "यह किन फसलों के लिए है?" },
  faq2A: {
    en: "It ships with class lists for {crops}. You can edit those classes, or add a crop and its classes yourself.",
    hi: "इसमें {crops} के लिए वर्ग सूचियाँ पहले से हैं। आप इन वर्गों को बदल सकते हैं, या ख़ुद कोई फसल और उसके वर्ग जोड़ सकते हैं।",
  },
  faq3Q: { en: "How accurate is it?", hi: "यह कितना सटीक है?" },
  faq3A: {
    en: "It depends on your grain and setup, so you measure it: grade 30–50 samples both ways (certified grader and this method) and the Validation page compares them class by class. Subtle defects, such as light heat damage or early sprouting, agree least.",
    hi: "यह आपके अनाज और व्यवस्था पर निर्भर करता है, इसलिए आप इसे ख़ुद मापते हैं: 30–50 नमूनों को दोनों तरीक़ों से (प्रमाणित ग्रेडर और यह तरीक़ा) ग्रेड करें, और सत्यापन पेज हर वर्ग की तुलना करता है। हल्की गर्मी की क्षति या शुरुआती अंकुरण जैसे बारीक दोषों में सबसे कम मेल होता है।",
  },
  faq4Q: {
    en: "Does it replace EN 15587 or manual grading?",
    hi: "क्या यह EN 15587 या हाथ से ग्रेडिंग की जगह लेता है?",
  },
  faq4A: {
    en: "No. It follows the same categories and a person confirms every flagged kernel, but it is a screening and pre-check tool. It is not acceptable for official trade grading unless validated and approved for that use.",
    hi: "नहीं। यह उन्हीं श्रेणियों पर चलता है और हर चिह्नित दाने की पुष्टि एक व्यक्ति करता है, लेकिन यह जाँच और पूर्व-परीक्षण का साधन है। जब तक इस काम के लिए सत्यापित और स्वीकृत न हो, यह आधिकारिक व्यापारिक ग्रेडिंग के लिए मान्य नहीं है।",
  },
  faq5Q: { en: "How fast is it?", hi: "यह कितना तेज़ है?" },
  faq5A: {
    en: "Kernel detection takes seconds per photo, and Claude classifies a batch of 100–150 kernels in parallel sheets, typically within a minute or two. The instant estimate is ready then; checking flagged kernels and weighing cups take a few more minutes.",
    hi: "दाने ढूँढने में हर फ़ोटो पर कुछ सेकंड लगते हैं, और Claude 100–150 दानों के बैच को साथ-साथ चलने वाली शीटों में आम तौर पर एक-दो मिनट में वर्गीकृत कर देता है। तब तक तुरंत अनुमान तैयार हो जाता है; चिह्नित दाने जाँचने और कप तौलने में कुछ मिनट और लगते हैं।",
  },
  faq6Q: {
    en: "Can it be tuned to our grain?",
    hi: "क्या इसे हमारे अनाज के हिसाब से ढाला जा सकता है?",
  },
  faq6A: {
    en: "Yes: write your standard's defect definitions, and add reference images of your own kernels. Every kernel an operator confirms also becomes a labelled training image you can export.",
    hi: "हाँ: अपने मानक के दोषों की परिभाषाएँ लिखें, और अपने दानों के संदर्भ चित्र जोड़ें। ऑपरेटर जिस भी दाने की पुष्टि करता है, वह लेबल वाला प्रशिक्षण चित्र भी बन जाता है जिसे आप निर्यात कर सकते हैं।",
  },
  faq7Q: { en: "How is data handled?", hi: "डेटा कैसे संभाला जाता है?" },
  faq7A: {
    en: "Photos and results are stored by your installation of AI-Grain. Kernel close-ups are sent to the Claude API for classification; nothing is processed on the phone itself. Access is by signed-in account, with roles and an activity log.",
    hi: "फ़ोटो और नतीजे आपके AI-Grain इंस्टॉलेशन में रखे जाते हैं। दानों की नज़दीकी तस्वीरें वर्गीकरण के लिए Claude API को भेजी जाती हैं; फ़ोन पर ख़ुद कोई प्रोसेसिंग नहीं होती। पहुँच साइन-इन खाते से होती है, भूमिकाओं और गतिविधि लॉग के साथ।",
  },
  faq8Q: {
    en: "How is it different from a NIR analyser?",
    hi: "यह NIR एनालाइज़र से कैसे अलग है?",
  },
  faq8A: {
    en: "A NIR analyser measures composition such as protein and moisture. This method looks at the physical side of the sample, kernel by kernel: broken and damaged kernels, admixtures and impurities.",
    hi: "NIR एनालाइज़र प्रोटीन और नमी जैसी संरचना मापता है। यह तरीक़ा नमूने के भौतिक पहलू को एक-एक दाने तक देखता है: टूटे और क्षतिग्रस्त दाने, मिलावट और अशुद्धियाँ।",
  },

  // Band
  bandTitle: { en: "See it on real grain", hi: "असली अनाज पर देखें" },
  bandText: {
    en: "Book a walkthrough, or send us a question about your crops and standards.",
    hi: "डेमो बुक करें, या अपनी फसलों और मानकों के बारे में हमें सवाल भेजें।",
  },
  bookMeeting: { en: "Book a meeting", hi: "मीटिंग बुक करें" },
});
