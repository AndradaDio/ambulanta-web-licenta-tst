Eficientizarea Interventiilor in Medicina de Urgenta prin Tehnologie Avansata

Descriere
Sistem experimental IoT end-to-end pentru monitorizarea parametrilor vitali ai pacientilor 
in timpul transportului cu ambulanta si transmiterea datelor live catre unitatea spitaliceasca 

Arhitectura
Sistemul este structurat pe trei niveluri:
1.Edge: microcontroler ESP32 cu senzori biomedicali
2.Cloud: platforma Firebase
3.Client: aplicatie web React cu doua module distincte

Componente hardware
-ESP32 DevKit V1
-MAX30102: senzor puls si saturatie de oxigen
-MLX90614: senzor de temperatura corporala non-contact
-OLED SSD1306: afisaj local
-Acumulatori Li-ion 18650
-Modul powerbank

Tehnologii software
-Firmware: C++ (Arduino IDE)
-Frontend: React, Vite
-Cloud: Firebase (Realtime Database, Firestore, Authentication, Hosting)

Functionalitati principale
-Monitorizare live BPM, SpO2 si temperatura cutanata
-Transmisie date prin HTTP PUT la intervale de 2 secunde
-Mecanism SessionId pentru identificarea pacientilor
-Modul Ambulanta pentru monitorizare live si inregistrate fisa pacienti
-Modul Spital pentru vizualizare date, management pacienti, export PDF
-Autentificare si control acces bazat pe roluri
