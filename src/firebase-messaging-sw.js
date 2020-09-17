importScripts('https://www.gstatic.com/firebasejs/5.4.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/5.4.1/firebase-messaging.js');

if (firebase.messaging.isSupported())

  firebase.initializeApp({
    'messagingSenderId': '332331317160'
  });
	const messaging = firebase.messaging();
  
  // This step is only mentioned in this guide: 
  //        https://firebase.google.com/docs/cloud-messaging/js/client
  // Don't know if it's actually needed
  // Add the public key generated from the console here.
  messaging.usePublicVapidKey("BM46P7RQ7mPGwe4-n2wxkJblnshupo5D3PSO1ZYs2t9Y7h4pwlTBOYJ5YhO5JGSwEdPHfX4mcaGFXnpuuqMc0yQ");
  
}