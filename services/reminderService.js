const cron = require('node-cron');
const db = require('../models/db');
const User = require('../models/User');
const Expense = require('../models/Expense');

let scheduledTasks = [];

function startReminders() {
  // Check every minute for reminders that match current time
  const task = cron.schedule('* * * * *', () => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const reminders = db.prepare('SELECT r.*, u.email, u.display_name FROM reminders r JOIN users u ON r.user_id = u.id WHERE r.enabled = 1 AND r.time = ?').all(currentTime);

    for (const reminder of reminders) {
      const today = now.toISOString().split('T')[0];
      const todayExpenses = Expense.getAllByUserAndDate(reminder.user_id, today);
      const total = todayExpenses.reduce((sum, e) => sum + e.amount, 0);

      // If no expenses today, send reminder
      if (todayExpenses.length === 0) {
        console.log(`[Reminder] Sending to ${reminder.display_name}: ${reminder.message}`);
        // In production, this would send via WhatsApp or email
      }
    }
  });

  scheduledTasks.push(task);
}

function stopReminders() {
  scheduledTasks.forEach(t => t.stop());
  scheduledTasks = [];
}

module.exports = { startReminders, stopReminders };
