/**
 * INTERVENTIONPRO - ENHANCEMENTS
 * 9 features in one file
 */

// ============================================
// Feature 2: Dashboard Task List
// ============================================
export const TaskListManager = {
  init() {
    if (!window.localStorage.getItem('interventionpro_tasks')) {
      window.localStorage.setItem('interventionpro_tasks', JSON.stringify([]));
    }
  },
  
  getTasks() {
    try {
      return JSON.parse(window.localStorage.getItem('interventionpro_tasks') || '[]');
    } catch {
      return [];
    }
  },
  
  addTask(title, priority = 'À faire', photos = []) {
    const tasks = this.getTasks();
    const task = {
      id: Date.now(),
      title,
      priority, // 'Très urgent', 'À faire', 'A le temps'
      photos,
      completed: false,
      createdAt: new Date().toISOString()
    };
    tasks.push(task);
    window.localStorage.setItem('interventionpro_tasks', JSON.stringify(tasks));
    return task;
  },
  
  toggleTask(taskId) {
    const tasks = this.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (task) task.completed = !task.completed;
    window.localStorage.setItem('interventionpro_tasks', JSON.stringify(tasks));
    return tasks;
  },
  
  deleteTask(taskId) {
    const tasks = this.getTasks().filter(t => t.id !== taskId);
    window.localStorage.setItem('interventionpro_tasks', JSON.stringify(tasks));
    return tasks;
  },
  
  getTasksSorted() {
    const tasks = this.getTasks();
    const incomplete = tasks.filter(t => !t.completed)
      .sort((a, b) => {
        const priority = { 'Très urgent': 0, 'À faire': 1, 'A le temps': 2 };
        return (priority[a.priority] || 2) - (priority[b.priority] || 2);
      });
    const completed = tasks.filter(t => t.completed);
    return [...incomplete, ...completed];
  }
};

// ============================================
// Feature 3: Custom Service Modules
// ============================================
export const ServiceModuleManager = {
  init() {
    if (!window.localStorage.getItem('interventionpro_modules')) {
      window.localStorage.setItem('interventionpro_modules', JSON.stringify([
        {
          id: 'drainage',
          name: 'Dégorgement',
          fields: { locations: ['Cuisine', 'Salle de bain'], problems: ['Bouchon total', 'Lenteur'] }
        }
      ]));
    }
  },
  
  getModules() {
    try {
      return JSON.parse(window.localStorage.getItem('interventionpro_modules') || '[]');
    } catch {
      return [];
    }
  },
  
  createModule(name, fields) {
    const modules = this.getModules();
    const module = {
      id: name.toLowerCase().replace(/\s/g, '_'),
      name,
      fields,
      createdAt: new Date().toISOString()
    };
    modules.push(module);
    window.localStorage.setItem('interventionpro_modules', JSON.stringify(modules));
    return module;
  },
  
  deleteModule(moduleId) {
    const modules = this.getModules().filter(m => m.id !== moduleId);
    window.localStorage.setItem('interventionpro_modules', JSON.stringify(modules));
    return modules;
  }
};

// ============================================
// Feature 4: PDF Natural Language Reformulation
// ============================================
export const PDFReformulator = {
  reformulate(checkedFields, serviceType) {
    const sentences = [];
    
    // Mapping des champs en phrases naturelles
    const fieldMappings = {
      'Bouchon total': 'Bouchon total constaté',
      'Lenteur': 'Écoulement lent constaté',
      'Odeur': 'Odeur désagréable signalée',
      'Débordement': 'Débordement observé',
      'Haute pression': 'Dégorgement réalisé à la haute pression',
      'Déboucheur': 'Déboucheur mécanique utilisé',
      'Nettoyage chimique': 'Traitement chimique appliqué'
    };
    
    Object.entries(checkedFields).forEach(([key, value]) => {
      if (value && fieldMappings[key]) {
        sentences.push(fieldMappings[key]);
      }
    });
    
    return sentences.length > 0 
      ? sentences.join('. ') + '.'
      : 'Intervention réalisée sans constations particulières.';
  }
};

// ============================================
// Feature 5: Email Sending Control
// ============================================
export const EmailController = {
  settings: {
    autoSendToClient: false, // Désactivé par défaut
    autoSendToA6T: true,     // Toujours actif
    sendMethod: 'manual'     // 'manual', 'whatsapp', 'sms'
  },
  
  setSendAutomatic(enabled) {
    this.settings.autoSendToClient = enabled;
    window.localStorage.setItem('interventionpro_email_settings', JSON.stringify(this.settings));
  },
  
  shouldSendAutomatic() {
    return this.settings.autoSendToClient === false; // Par défaut, ne pas envoyer
  },
  
  sendManual(to, subject, body) {
    // Envoyer via API backend
    return fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body })
    });
  }
};

// ============================================
// Feature 6: Safari Session Persistence
// ============================================
export const SafariPersistence = {
  async init(auth) {
    // Import browserLocalPersistence depuis firebase
    const { browserLocalPersistence, setPersistence } = await import('firebase/auth');
    
    try {
      await setPersistence(auth, browserLocalPersistence);
      console.log('Safari persistence enabled');
    } catch (error) {
      console.warn('Persistence error:', error);
    }
  }
};

// ============================================
// Feature 7: GPS App Selection
// ============================================
export const GPSSelector = {
  apps: ['Google Maps', 'Waze', 'Apple Maps'],
  
  init() {
    const saved = window.localStorage.getItem('interventionpro_gps_app');
    if (!saved) {
      window.localStorage.setItem('interventionpro_gps_app', 'Google Maps');
    }
  },
  
  getPreferred() {
    return window.localStorage.getItem('interventionpro_gps_app') || 'Google Maps';
  },
  
  setPreferred(app) {
    if (this.apps.includes(app)) {
      window.localStorage.setItem('interventionpro_gps_app', app);
    }
  },
  
  openAddress(address, lat, lng) {
    const app = this.getPreferred();
    let url = '';
    
    if (app === 'Google Maps') {
      url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
    } else if (app === 'Waze') {
      url = `https://waze.com/ul?navigate=yes&q=${encodeURIComponent(address)}`;
    } else if (app === 'Apple Maps') {
      url = `maps://maps.apple.com/?address=${encodeURIComponent(address)}`;
    }
    
    if (url) window.open(url, '_blank');
  }
};

// ============================================
// Feature 8: Web Push Notifications
// ============================================
export const PushNotifications = {
  async init() {
    if ('serviceWorker' in navigator && 'Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.VITE_VAPID_PUBLIC_KEY
        });
        
        // Envoyer le token au serveur pour ce technicien
        this.savePushToken(subscription.endpoint);
      }
    }
  },
  
  savePushToken(token) {
    fetch('/api/save-push-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, technicianId: localStorage.getItem('tech_id') })
    });
  },
  
  notify(title, options = {}) {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          icon: '/logo.png',
          badge: '/badge.png',
          ...options
        });
      });
    }
  }
};

// ============================================
// Feature 9: AI Quote Forfait Mode
// ============================================
export const AIQuoteGenerator = {
  async generateQuote(jobDescription) {
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'generate_quote',
          description: jobDescription
        })
      });
      
      const data = await response.json();
      return {
        lineItems: data.lineItems || [],
        totalAmount: data.totalAmount || 0,
        formatted: data.formatted || ''
      };
    } catch (error) {
      console.error('Quote generation error:', error);
      return null;
    }
  },
  
  formatQuote(quote) {
    return quote.lineItems
      .map(item => `${item.description}: ${item.quantity}x ${item.amount}€`)
      .join('\n') + `\n\nTOTAL: ${quote.totalAmount}€`;
  }
};

// ============================================
// Initialisation générale
// ============================================
export function initializeEnhancements(auth = null) {
  TaskListManager.init();
  ServiceModuleManager.init();
  GPSSelector.init();
  EmailController.setSendAutomatic(false); // Désactiver par défaut
  
  if (auth) {
    SafariPersistence.init(auth);
  }
  
  if ('serviceWorker' in navigator) {
    PushNotifications.init();
  }
  
  console.log('✅ Enhancements initialized');
}

export default {
  TaskListManager,
  ServiceModuleManager,
  PDFReformulator,
  EmailController,
  SafariPersistence,
  GPSSelector,
  PushNotifications,
  AIQuoteGenerator,
  initializeEnhancements
};