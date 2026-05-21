import React, { useState } from 'react'
import Header from '../components/Header.jsx'

// ── Icons ─────────────────────────────────────────────────────────────────────
const Icon = {
  delivery: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 8h14M5 8a2 2 0 00-2 2v6a2 2 0 002 2h14a2 2 0 002-2v-6a2 2 0 00-2-2"/>
      <path d="M8 8V6a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  bill: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  ),
  payment: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
    </svg>
  ),
  customer: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  report: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  backup: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
      <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
    </svg>
  ),
  tip: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
  warn: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
}

// ── Data ──────────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'workflow',
    title: 'मुख्य कार्यप्रवाह',
    sub: 'Daily workflow',
    emoji: '🔄',
    color: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
  },
  {
    id: 'delivery',
    title: 'डिलिव्हरी नोंद',
    sub: 'How to record deliveries',
    emoji: '🥛',
    color: '#10b981',
    tint: 'rgba(16,185,129,0.12)',
  },
  {
    id: 'customers',
    title: 'ग्राहक व्यवस्थापन',
    sub: 'Managing customers',
    emoji: '👥',
    color: '#06b6d4',
    tint: 'rgba(6,182,212,0.12)',
  },
  {
    id: 'bills',
    title: 'बिल व पैसे',
    sub: 'Billing & payments',
    emoji: '📋',
    color: '#8b5cf6',
    tint: 'rgba(139,92,246,0.12)',
  },
  {
    id: 'reports',
    title: 'अहवाल',
    sub: 'Reports & analytics',
    emoji: '📊',
    color: '#f59e0b',
    tint: 'rgba(245,158,11,0.12)',
  },
  {
    id: 'settings',
    title: 'सेटिंग्ज',
    sub: 'Settings & rates',
    emoji: '⚙️',
    color: '#ec4899',
    tint: 'rgba(236,72,153,0.12)',
  },
  {
    id: 'backup',
    title: 'बॅकअप',
    sub: 'Backup & restore',
    emoji: '💾',
    color: '#3b82f6',
    tint: 'rgba(59,130,246,0.12)',
  },
  {
    id: 'faq',
    title: 'सामान्य प्रश्न',
    sub: 'Frequently asked questions',
    emoji: '❓',
    color: '#94a3b8',
    tint: 'rgba(148,163,184,0.12)',
  },
]

const CONTENT = {
  workflow: {
    intro: 'अॅप वापरण्याचा दैनंदिन क्रम समजून घ्या. हे ३ टप्पे दररोज करायचे आहेत.',
    steps: [
      {
        num: '1',
        title: 'सकाळी — डिलिव्हरी नोंद करा',
        color: '#10b981',
        desc: 'दूध देताना किंवा दिल्यानंतर लगेच "डिलिव्हरी" पेजवर जा. प्रत्येक ग्राहकाला किती दूध दिले ते नोंद करा.',
        actions: [
          'डिलिव्हरी → सकाळ सत्र निवडा',
          'प्रत्येक ग्राहकापुढे "दिले" दाबा',
          'कमी दिले तर "कमी" दाबून प्रमाण टाका',
          'न दिले तर "वगळा" दाबा',
        ],
      },
      {
        num: '2',
        title: 'महिना संपल्यावर — बिल तयार करा',
        color: '#8b5cf6',
        desc: 'महिना संपल्यावर (किंवा आधी) "बिल" पेजवर जाऊन त्या महिन्याचे बिल तयार करा. सर्व ग्राहकांचे बिल एकत्र तयार होते.',
        actions: [
          'बिल पेज → + बिल तयार करा',
          'महिना निवडा (उदा. मे २०२५)',
          'पुष्टी करा — बिल तयार होते',
          'प्रत्येक ग्राहकाला बिल पाठवा (WhatsApp)',
        ],
      },
      {
        num: '3',
        title: 'पैसे आल्यावर — जमा नोंद करा',
        color: '#f59e0b',
        desc: 'ग्राहकाने पैसे दिले की लगेच "बिल" पेजच्या "पैसे जमा" टॅबमध्ये नोंद करा.',
        actions: [
          'बिल → पैसे जमा टॅब',
          '+ जमा → ग्राहक निवडा',
          'रक्कम आणि माध्यम टाका',
          'थकबाकी आपोआप कमी होते',
        ],
      },
    ],
    tip: { type: 'tip', text: 'संध्याकाळी दूध देत असाल तर संध्याकाळचे सत्रही नोंद करा. सकाळ आणि संध्याकाळचे हिशोब स्वतंत्र ठेवले जातात.' },
  },

  delivery: {
    intro: 'डिलिव्हरी पेजवर आजचे दूध कोणाला, किती दिले ते नोंदवायचे आहे.',
    blocks: [
      {
        title: 'सत्र (Session) म्हणजे काय?',
        icon: 'tip',
        color: '#10b981',
        content: [
          '☀️ सकाळ — सकाळचे दूध (6am–12pm)',
          '🌙 संध्याकाळ — संध्याकाळचे दूध (4pm–8pm)',
          'एखाद्या ग्राहकाला दोन्ही वेळा दूध जात असेल तर दोन्ही स्वतंत्र नोंदवा.',
          'फक्त एकाच वेळेस दूध जात असेल तर फक्त तेच सत्र वापरा.',
        ],
      },
      {
        title: 'नोंदीचे प्रकार',
        icon: 'delivery',
        color: '#10b981',
        rows: [
          { badge: 'दिले', badgeColor: '#10b981', badgeTint: 'rgba(16,185,129,0.15)', text: 'पूर्ण प्रमाण दिले. ग्राहकाच्या सबस्क्रिप्शनप्रमाणे दूध गेले.' },
          { badge: 'कमी', badgeColor: '#3b82f6', badgeTint: 'rgba(59,130,246,0.15)', text: 'कमी प्रमाण दिले. उदा. 2L ऐवजी 1.5L दिले. "कमी" दाबून नवीन प्रमाण टाका.' },
          { badge: 'वगळा', badgeColor: '#94a3b8', badgeTint: 'rgba(148,163,184,0.15)', text: 'आज दिले नाही. बिलात या दिवसाचे पैसे येणार नाहीत.' },
          { badge: 'बाकी', badgeColor: '#f59e0b', badgeTint: 'rgba(245,158,11,0.15)', text: 'अजून नोंद केली नाही. दिवस संपण्यापूर्वी नोंद करा.' },
        ],
      },
      {
        title: 'सर्वांना एकत्र "दिले" करा',
        icon: 'tip',
        color: '#06b6d4',
        content: [
          'वर "✓ सर्वांना दिले" बटण दाबल्यास त्या यादीतील सर्व ग्राहकांना पूर्ण प्रमाण दिले असे नोंदेल.',
          'हे फक्त त्या वेळी दाखवलेल्या ग्राहकांसाठी होते (भागानुसार फिल्टर केले असल्यास त्याच भागासाठी).',
        ],
      },
      {
        title: 'एक्स्ट्रा उत्पादन (Extra Product)',
        icon: 'tip',
        color: '#8b5cf6',
        content: [
          'दुधाव्यतिरिक्त दही, तूप, पनीर यासारखे पदार्थ देत असाल तर ग्राहकाच्या नावापुढे "+ एक्स्ट्रा" दाबा.',
          'हे उत्पादन त्या दिवसासाठी नोंदवले जाते आणि बिलात आपोआप जोडले जाते.',
        ],
      },
    ],
    warn: { type: 'warn', text: 'डिलिव्हरी नोंद ही त्याच दिवशी करणे उत्तम. जुन्या तारखेची नोंद होऊ शकते पण बिलात चुका येऊ शकतात.' },
  },

  customers: {
    intro: 'ग्राहक पेजवर सर्व ग्राहकांची माहिती ठेवता येते.',
    blocks: [
      {
        title: 'नवीन ग्राहक कसा जोडावा?',
        icon: 'customer',
        color: '#06b6d4',
        steps: [
          'ग्राहक पेज → + नवीन ग्राहक',
          'नाव, मोबाईल, पत्ता भरा',
          'दुधाचा प्रकार निवडा (म्हैस / गाय)',
          'सकाळ/संध्याकाळ किती लिटर ते टाका',
          'दर प्रति लिटर टाका',
          'सुरुवातीची तारीख निवडा',
          'सेव्ह करा',
        ],
      },
      {
        title: 'ग्राहक स्थिती (Status)',
        icon: 'tip',
        color: '#06b6d4',
        rows: [
          { badge: 'सक्रिय', badgeColor: '#10b981', badgeTint: 'rgba(16,185,129,0.15)', text: 'रोज दूध जात आहे. डिलिव्हरी यादीत दिसतो.' },
          { badge: 'थांबले', badgeColor: '#f59e0b', badgeTint: 'rgba(245,158,11,0.15)', text: 'तात्पुरते बंद. काही दिवसांसाठी दूध बंद आहे. यादीत दिसत नाही.' },
          { badge: 'बंद', badgeColor: '#ef4444', badgeTint: 'rgba(239,68,68,0.15)', text: 'कायमचे बंद. या ग्राहकाला आता दूध जात नाही.' },
        ],
      },
      {
        title: 'ग्राहकाचे संपूर्ण खाते पाहणे',
        icon: 'tip',
        color: '#06b6d4',
        content: [
          'ग्राहकाच्या नावावर दाबल्यास त्याचे संपूर्ण प्रोफाइल उघडते.',
          'तिथे ३ टॅब आहेत: बिल, डिलिव्हरी, पेमेंट.',
          'बिल टॅब — त्या ग्राहकाचे महिनावार बिल.',
          'डिलिव्हरी टॅब — रोजची डिलिव्हरी इतिहास.',
          'पेमेंट टॅब — जमा केलेले पैसे.',
        ],
      },
    ],
    tip: { type: 'tip', text: 'ग्राहक हटवल्यास त्याच्या सर्व डिलिव्हरी आणि बिलांची माहितीही हटेल. हे पूर्ववत होत नाही. त्यामुळे हटवण्याऐवजी स्थिती "बंद" करा.' },
  },

  bills: {
    intro: 'बिल पेजमध्ये ३ टॅब आहेत: बिल, पैसे जमा, थकबाकी.',
    blocks: [
      {
        title: 'बिल तयार करण्याची प्रक्रिया',
        icon: 'bill',
        color: '#8b5cf6',
        steps: [
          'बिल पेज → + बिल तयार करा',
          'महिना निवडा (उदा. मे २०२५)',
          'किती ग्राहकांचे बिल होणार ते दिसते — पुष्टी करा',
          'बिल तयार होते. त्यात सर्व डिलिव्हरी आणि आधीची थकबाकी जोडली जाते.',
          'प्रत्येक बिलावर दाबून विस्तार पाहा, WhatsApp वर पाठवा किंवा प्रिंट करा.',
        ],
      },
      {
        title: 'बिलात काय असते?',
        icon: 'tip',
        color: '#8b5cf6',
        rows: [
          { badge: 'डिलिव्हरी', badgeColor: '#10b981', badgeTint: 'rgba(16,185,129,0.15)', text: 'महिन्यातील सर्व डिलिव्हरीची बेरीज (प्रत्येक उत्पादनाप्रमाणे).' },
          { badge: 'मागील बाकी', badgeColor: '#f59e0b', badgeTint: 'rgba(245,158,11,0.15)', text: 'गेल्या बिलाचे न भरलेले पैसे आपोआप जोडले जातात.' },
          { badge: 'एकूण', badgeColor: '#8b5cf6', badgeTint: 'rgba(139,92,246,0.15)', text: 'डिलिव्हरी + मागील बाकी = एकूण देणे.' },
          { badge: 'जमा', badgeColor: '#06b6d4', badgeTint: 'rgba(6,182,212,0.15)', text: 'या महिन्यात किती पैसे जमा झाले.' },
          { badge: 'बाकी', badgeColor: '#ef4444', badgeTint: 'rgba(239,68,68,0.15)', text: 'एकूण - जमा = अजून किती द्यायचे आहे.' },
        ],
      },
      {
        title: 'पैसे जमा करणे',
        icon: 'payment',
        color: '#f59e0b',
        steps: [
          'बिल पेज → पैसे जमा टॅब',
          '+ जमा बटण दाबा',
          'ग्राहक निवडा, रक्कम टाका',
          'माध्यम निवडा: रोख / UPI / बँक / चेक',
          'सेव्ह करा — थकबाकी आपोआप कमी होते',
        ],
      },
      {
        title: 'थकबाकी टॅब',
        icon: 'tip',
        color: '#ef4444',
        content: [
          'थकबाकी टॅबमध्ये ज्या ग्राहकांचे पैसे अजून आले नाहीत ते दिसतात.',
          'प्रत्येक ग्राहकापुढे किती बाकी आहे आणि किती % भरले ते दिसते.',
          '"जमा करा" बटण दाबून थेट पेमेंट नोंदवता येते.',
        ],
      },
    ],
    warn: { type: 'warn', text: 'बिल "लॉक" केल्यानंतर ते बदलता किंवा हटवता येत नाही. बिल लॉक करण्यापूर्वी सर्व माहिती तपासा.' },
  },

  reports: {
    intro: 'अहवाल पेजमध्ये ४ टॅब आहेत. प्रत्येक टॅब वेगळी माहिती देतो.',
    blocks: [
      {
        title: 'आजचा अहवाल (टॅब १)',
        icon: 'report',
        color: '#10b981',
        content: [
          'आजच्या डिलिव्हरीचा सारांश — सकाळ आणि संध्याकाळ स्वतंत्र.',
          'किती ग्राहकांना दिले, किती बाकी आहेत.',
          'प्रत्येक उत्पादनाचे आजचे एकूण लिटर/किलो.',
          'आजच्या पैसे जमा नोंदी.',
        ],
      },
      {
        title: 'मासिक अहवाल (टॅब २)',
        icon: 'report',
        color: '#f59e0b',
        content: [
          'निवडलेल्या महिन्याचे एकूण बिल, जमा आणि थकबाकी.',
          '"कार्यक्षमता %" म्हणजे जमा ÷ बिल. उदा. 85% म्हणजे 85 रुपयांपैकी 85 पैसे जमा झाले.',
          'उत्पादनानुसार महसूल — म्हैस दूध किती, गाय दूध किती.',
          'सर्वाधिक बिल असलेले ५ ग्राहक.',
        ],
      },
      {
        title: 'ग्राहक अहवाल (टॅब ३)',
        icon: 'customer',
        color: '#06b6d4',
        content: [
          'प्रत्येक ग्राहकाचे एकूण बिल, जमा आणि बाकी.',
          'हिरवी पट्टी — किती % जमा झाले याचे दृश्य.',
          'ज्या ग्राहकाची पट्टी लहान आहे तो जास्त थकबाकी असलेला ग्राहक.',
        ],
      },
      {
        title: '६ महिन्यांचा तक्ता (टॅब ४)',
        icon: 'report',
        color: '#8b5cf6',
        content: [
          'गेल्या ६ महिन्यांचे बिल (हिरवी पट्टी) आणि जमा (निळी पट्टी) एकत्र दिसतात.',
          'पट्ट्यांमधील फरक म्हणजे त्या महिन्याची थकबाकी.',
          'कोणता महिना सर्वोत्तम/सर्वात वाईट होता हे लगेच कळते.',
        ],
      },
    ],
  },

  settings: {
    intro: 'सेटिंग्ज पेजमध्ये २ टॅब आहेत: डेअरी माहिती आणि दर व्यवस्थापन.',
    blocks: [
      {
        title: 'डेअरी माहिती भरणे',
        icon: 'settings',
        color: '#ec4899',
        steps: [
          'सेटिंग्ज → डेअरी माहिती टॅब',
          'डेअरीचे नाव, मालकाचे नाव, मोबाईल, पत्ता भरा',
          'हे सर्व बिलावर आणि PDF वर छापले जाते',
          'बदल केल्यावर "जतन करा" दाबा',
        ],
      },
      {
        title: 'दर बदलणे',
        icon: 'settings',
        color: '#ec4899',
        steps: [
          'सेटिंग्ज → दर व्यवस्थापन टॅब',
          'म्हैस दूध किंवा गाय दूध निवडा',
          'नवीन दर टाका (₹ प्रति लिटर)',
          '"दर जतन करा" दाबा',
          'हा दर आजपासून पुढे लागू होतो. जुन्या नोंदींवर परिणाम होत नाही.',
        ],
      },
      {
        title: 'दर इतिहास',
        icon: 'tip',
        color: '#ec4899',
        content: [
          'प्रत्येक वेळी दर बदलला तर तो इतिहासात दिसतो.',
          '▲ हिरव्या रंगाचा बाण — दर वाढला.',
          '▼ लाल रंगाचा बाण — दर कमी झाला.',
          'जुने दर येथे नेहमी पाहता येतात.',
        ],
      },
    ],
    warn: { type: 'warn', text: 'महिन्याच्या मध्ये दर बदलल्यास नवीन दर त्या दिवसापासून पुढे लागू होतो. महिन्याची बिले तयार करण्यापूर्वी दर बरोबर आहे का तपासा.' },
  },

  backup: {
    intro: 'बॅकअप पेजवरून सर्व डेटा सुरक्षित ठेवता येतो.',
    blocks: [
      {
        title: 'JSON बॅकअप (पूर्ण डेटा)',
        icon: 'backup',
        color: '#3b82f6',
        steps: [
          'बॅकअप → "बॅकअप डाउनलोड करा" बटण दाबा',
          'एक JSON फाईल डाउनलोड होते',
          'ही फाईल Google Drive / WhatsApp वर सेव्ह करा',
          'फोन बदलताना किंवा अॅप पुन्हा इन्स्टॉल करताना ही फाईल वापरता येते',
        ],
      },
      {
        title: 'डेटा रिस्टोर करणे',
        icon: 'warn',
        color: '#ef4444',
        steps: [
          'बॅकअप → "बॅकअप फाईल निवडा" दाबा',
          'आधी डाउनलोड केलेली JSON फाईल निवडा',
          'डेटा पुनर्स्थापित होतो',
          '⚠️ हे सध्याच्या डेटावर लिहिले जाते. आधी बॅकअप घ्या.',
        ],
      },
      {
        title: 'CSV एक्सपोर्ट',
        icon: 'backup',
        color: '#3b82f6',
        content: [
          'ग्राहक यादी, डिलिव्हरी, बिल, पेमेंट — प्रत्येक Excel मध्ये उघडता येणाऱ्या CSV फाईलमध्ये एक्सपोर्ट करता येते.',
          'हे बाह्य हिशोब किंवा सीए साठी उपयुक्त आहे.',
        ],
      },
    ],
    tip: { type: 'tip', text: 'दर आठवड्याला एकदा बॅकअप घेणे उत्तम. बॅकअप फाईल Google Drive मध्ये ठेवल्यास फोन हरवला तरी डेटा सुरक्षित राहतो.' },
  },

  faq: {
    questions: [
      {
        q: 'दूध रोज न दिल्यास बिलात काय होते?',
        a: 'ज्या दिवशी "वगळा" नोंदवले त्या दिवसाचे पैसे बिलात येत नाहीत. "बाकी" राहिलेले दिवस बिलात धरले जातात — त्यामुळे रोज नोंद करणे गरजेचे आहे.',
      },
      {
        q: '"थकबाकी" म्हणजे काय?',
        a: 'ग्राहकाने अजून न भरलेली रक्कम. एकूण बिल − जमा पैसे = थकबाकी. थकबाकी > 0 म्हणजे ग्राहकाने अजून पूर्ण पैसे दिले नाहीत.',
      },
      {
        q: 'ग्राहक हटवला तर डेटा जातो का?',
        a: 'होय — ग्राहक हटवल्यास त्याची सर्व डिलिव्हरी, बिले आणि पेमेंट हटतात. त्यामुळे हटवण्याऐवजी स्थिती "बंद" करा.',
      },
      {
        q: 'दर बदलल्यास जुने बिल बदलते का?',
        a: 'नाही. नवीन दर फक्त पुढच्या डिलिव्हरीपासून लागू होतो. आधीच तयार केलेले बिल जसे आहे तसेच राहते.',
      },
      {
        q: 'महिन्यात बिल तयार केले आणि नंतर काही डिलिव्हरी नोंदवल्या, तर काय?',
        a: 'आधी तयार केलेले बिल UPDATE होत नाही. बिल हटवून पुन्हा तयार करावे लागेल. बिल लॉक नसेल तरच हटवता येते.',
      },
      {
        q: '"सकाळ" आणि "संध्याकाळ" दोन्ही नोंदवायला हव्यात का?',
        a: 'जर ग्राहकाला दोन्ही वेळा दूध जात असेल तरच. एकाच वेळी दूध जात असल्यास फक्त त्याच सत्राची नोंद करा.',
      },
      {
        q: 'बिल WhatsApp वर कसे पाठवायचे?',
        a: 'ग्राहकाच्या प्रोफाइलमध्ये जा → बिल टॅब → बिलावर दाबा → WhatsApp आयकॉन दाबा. ग्राहकाचा मोबाईल नंबर सेव्ह असणे आवश्यक आहे.',
      },
      {
        q: 'डेटा कुठे साठवला जातो?',
        a: 'सर्व डेटा फक्त तुमच्या फोनमध्ये साठवला जातो (IndexedDB). इंटरनेट नसतानाही अॅप काम करते. फोन बदलताना बॅकअप घेणे अत्यंत महत्त्वाचे आहे.',
      },
      {
        q: 'पेमेंट चुकीचे नोंदवले, ते बदलता येते का?',
        a: 'सध्या पेमेंट संपादित करण्याची सुविधा नाही. चुकीचे पेमेंट झाल्यास वेगळी नोंद करा किंवा थेट ग्राहक प्रोफाइलमधून संपर्क साधा.',
      },
      {
        q: 'अॅप ऑफलाइन काम करते का?',
        a: 'हो! हे अॅप पूर्णपणे ऑफलाइन काम करते. इंटरनेट नसतानाही सर्व सुविधा वापरता येतात.',
      },
    ],
  },
}

// ── Components ────────────────────────────────────────────────────────────────
function TipBox({ type, text }) {
  const isWarn = type === 'warn'
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '12px 14px',
      background: isWarn ? 'rgba(245,158,11,0.08)' : 'rgba(16,185,129,0.08)',
      border: `1px solid ${isWarn ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
      borderRadius: 10, marginTop: 12,
    }}>
      <div style={{ color: isWarn ? '#f59e0b' : '#10b981', flexShrink: 0, marginTop: 1 }}>
        {isWarn ? Icon.warn : Icon.tip}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.65 }}>{text}</div>
    </div>
  )
}

function StepList({ steps }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff',
            fontSize: 11, fontWeight: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 1,
          }}>{i + 1}</div>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.55, paddingTop: 2 }}>{s}</div>
        </div>
      ))}
    </div>
  )
}

function ActionList({ actions }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
      {actions.map((a, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ color: '#10b981', flexShrink: 0, marginTop: 2 }}>{Icon.check}</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>{a}</div>
        </div>
      ))}
    </div>
  )
}

function BadgeRow({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '3px 8px',
            borderRadius: 6, background: r.badgeTint, color: r.badgeColor,
            marginTop: 1, whiteSpace: 'nowrap',
          }}>{r.badge}</span>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>{r.text}</div>
        </div>
      ))}
    </div>
  )
}

function BulletList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 10 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 6 }} />
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55 }}>{item}</div>
        </div>
      ))}
    </div>
  )
}

function SectionContent({ id }) {
  const data = CONTENT[id]
  if (!data) return null

  if (id === 'faq') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.questions.map((faq, i) => (
          <FAQItem key={i} q={faq.q} a={faq.a} />
        ))}
      </div>
    )
  }

  if (id === 'workflow') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 16 }}>{data.intro}</div>
        {data.steps.map((step, i) => (
          <div key={i} style={{
            background: 'var(--surface2)', borderRadius: 12,
            padding: 14, marginBottom: 10,
            borderLeft: `3px solid ${step.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8,
                background: step.color, color: '#fff',
                fontSize: 12, fontWeight: 900,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{step.num}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{step.title}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>{step.desc}</div>
            <ActionList actions={step.actions} />
          </div>
        ))}
        {data.tip && <TipBox {...data.tip} />}
      </div>
    )
  }

  return (
    <div>
      {data.intro && (
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 14 }}>{data.intro}</div>
      )}
      {data.blocks && data.blocks.map((block, i) => (
        <div key={i} style={{
          background: 'var(--surface2)', borderRadius: 12,
          padding: 14, marginBottom: 10,
          borderLeft: `3px solid ${block.color}`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
            {block.title}
          </div>
          {block.steps   && <StepList steps={block.steps} />}
          {block.actions && <ActionList actions={block.actions} />}
          {block.rows    && <BadgeRow rows={block.rows} />}
          {block.content && <BulletList items={block.content} />}
        </div>
      ))}
      {data.tip  && <TipBox {...data.tip} />}
      {data.warn && <TipBox {...data.warn} />}
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 10, padding: '13px 14px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45 }}>{q}</div>
        <div style={{
          color: 'var(--text2)', flexShrink: 0, fontSize: 16,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>›</div>
      </button>
      {open && (
        <div style={{
          padding: '0 14px 14px',
          fontSize: 13, color: 'var(--text2)', lineHeight: 1.65,
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
        }}>{a}</div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Help() {
  const [activeSection, setActiveSection] = useState(null)

  if (activeSection) {
    const sec = SECTIONS.find(s => s.id === activeSection)
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 32 }}>
        <Header
          title={sec.title}
          subtitle={sec.sub}
          icon={sec.emoji}
          onBack={() => setActiveSection(null)}
        />
        <div style={{ padding: 16 }}>
          <SectionContent id={activeSection} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'var(--nav-h)' }}>
      <Header title="मदत व माहिती" icon="📖" subtitle="अॅप कसे वापरायचे" />
      <div style={{ padding: 16 }}>

        {/* Quick workflow banner */}
        <div style={{
          background: 'linear-gradient(135deg, #065f46 0%, #0f172a 100%)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 16, padding: 16, marginBottom: 20,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#6ee7b7', marginBottom: 8 }}>📌 रोजचा क्रम</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { icon: '🥛', label: 'डिलिव्हरी\nनोंद' },
              { icon: '→',  label: null },
              { icon: '📋', label: 'बिल\nतयार करा' },
              { icon: '→',  label: null },
              { icon: '💰', label: 'पैसे\nजमा' },
            ].map((item, i) => (
              item.label ? (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 22 }}>{item.icon}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 1.4, whiteSpace: 'pre' }}>{item.label}</div>
                </div>
              ) : (
                <div key={i} style={{ color: 'rgba(255,255,255,0.3)', fontSize: 18, paddingBottom: 14 }}>{item.icon}</div>
              )
            ))}
          </div>
          <button
            onClick={() => setActiveSection('workflow')}
            style={{
              marginTop: 12, width: '100%', background: 'rgba(16,185,129,0.2)',
              border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8,
              padding: '9px', color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >
            संपूर्ण कार्यप्रवाह पाहा →
          </button>
        </div>

        {/* Section list */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
          सर्व मार्गदर्शिका
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '13px 14px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 11,
                background: sec.tint, fontSize: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{sec.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{sec.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sec.sub}</div>
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 18, flexShrink: 0 }}>›</div>
            </button>
          ))}
        </div>

        {/* App info footer */}
        <div style={{
          marginTop: 20, padding: 14,
          background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>🥛</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Dud Dairy v1.0</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 }}>
            Offline Dairy Management App<br/>
            सर्व डेटा फक्त तुमच्या फोनमध्ये · इंटरनेट नसतानाही काम करते
          </div>
        </div>

      </div>
    </div>
  )
}
