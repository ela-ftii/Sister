// server.js
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

// --- PENTING: Menggunakan port dinamis dari lingkungan cloud (Railway) ---
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
// Melayani file statis (index.html, CSS, JS) dari folder 'public'
app.use(express.static('public')); 

// --- Database Simulasi ---
let strong_db_kehadiran = {}; 
let strong_db_nilai_tugas = {}; 

let weak_db_nilai_tugas_replica = {}; 
let eventual_db_nilai_akhir = {}; 

// --- LOG PERISTIWA ---
let log_peristiwa = [];

// Variabel untuk simulasi Consistency
const WEAK_REPLICATION_DELAY = 60000; // 60 detik (1 menit) untuk replikasi Weak
const EVENTUAL_BATCH_INTERVAL = 5000; // 5 detik untuk proses batch Eventual

// Fungsi untuk mencatat peristiwa
function addLog(type, message, details = {}) {
    const timestamp = new Date().toLocaleTimeString('id-ID');
    const logEntry = { timestamp, type, message, details };
    log_peristiwa.unshift(logEntry); // Tambahkan ke depan
    if (log_peristiwa.length > 50) {
        log_peristiwa.pop(); 
    }
    console.log(`[LOG ${type}] ${timestamp}: ${message}`);
}

// --- Simulasi Consistency Logic ---

/**
 * Strong Consistency: Kehadiran (Akurasi instan)
 */
app.post('/api/strong/kehadiran', (req, res) => {
    const { studentId, isPresent } = req.body;
    
    strong_db_kehadiran[studentId] = isPresent;
    
    addLog('STRONG_WRITE', `Kehadiran dicatat segera.`, { studentId, isPresent, db: 'Strong' });
    res.status(200).json({ 
        message: 'Kehadiran dicatat segera (Strong Consistency).',
        status: strong_db_kehadiran[studentId] ? 'Hadir' : 'Tidak Hadir'
    });
});


/**
 * Weak Consistency: Nilai Tugas (Kecepatan input diutamakan)
 */
app.post('/api/weak/nilai_tugas', (req, res) => {
    const { studentId, score } = req.body;

    // 1. Tulis ke DB utama (Strong write)
    strong_db_nilai_tugas[studentId] = score;

    addLog('WEAK_WRITE_START', `Nilai Tugas diterima oleh server.`, { studentId, score, db: 'Strong' });

    // 2. Respon segera (Weak Consistency)
    res.status(202).json({ 
        message: 'Nilai Tugas diterima (Weak Consistency). Anda mungkin melihat nilai lama saat ini selama 1 menit.',
        score_received: score
    });

    // 3. Replikasi Asynchronous ke replika yang dibaca klien (Simulasi delay 1 menit)
    setTimeout(() => {
        weak_db_nilai_tugas_replica[studentId] = score; 
        addLog('WEAK_REPLICATION_END', `Nilai Tugas direplikasi ke replika klien.`, { studentId, score, db: 'Weak Replica' });
    }, WEAK_REPLICATION_DELAY); 
});


/**
 * Eventual Consistency: Perhitungan Nilai Akhir (Pasti benar pada waktunya)
 */
function runBatchProcess() {
    addLog('EVENTUAL_BATCH_START', 'Menjalankan Batch Calculation...');
    
    let updatedCount = 0;
    for (const studentId in strong_db_kehadiran) {
        // Ambil data dari sumber Strong
        const kehadiran = strong_db_kehadiran[studentId] ? 1 : 0; 
        const nilaiTugas = strong_db_nilai_tugas[studentId] || 0; 
        // Formula Simulasi Nilai Akhir: (Kehadiran * 40) + (Nilai Tugas * 0.6)
        const finalScore = (kehadiran * 40) + (nilaiTugas * 0.6);

        if (eventual_db_nilai_akhir[studentId] !== finalScore.toFixed(2)) {
            updatedCount++;
        }
        eventual_db_nilai_akhir[studentId] = finalScore.toFixed(2);
    }
    addLog('EVENTUAL_BATCH_END', `Perhitungan Nilai Akhir selesai. ${updatedCount} data diperbarui.`, { updatedCount, db: 'Eventual Result' });
}

// Mulai scheduler Eventual Consistency (Batch 5 detik)
setInterval(runBatchProcess, EVENTUAL_BATCH_INTERVAL);


// --- API Pembacaan Data ---

app.get('/api/data/:studentId', (req, res) => {
    const studentId = req.params.studentId;

    const data = {
        studentId,
        kehadiran: strong_db_kehadiran[studentId] ? 'Hadir (Strong)' : 'Tidak Hadir (Strong)',
        nilai_tugas: weak_db_nilai_tugas_replica[studentId] || 'N/A (Weak - tertinggal hingga 1m)',
        nilai_akhir: eventual_db_nilai_akhir[studentId] || 'N/A (Eventual - tunggu batch 5s)',
    };

    res.json(data);
});

// --- API Mendapatkan Log Peristiwa ---
app.get('/api/log', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(log_peristiwa);
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`Server berjalan di port ${PORT}`);
});

// Inisialisasi data awal (contoh mahasiswa)
strong_db_kehadiran['MHS001'] = false;
strong_db_nilai_tugas['MHS001'] = 75;
weak_db_nilai_tugas_replica['MHS001'] = 75;