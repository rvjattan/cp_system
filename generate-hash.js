#!/usr/bin/env node

/**
 * Password Hash Generator
 * 
 * This script generates bcrypt hashes for passwords.
 * Use this to generate password hashes for the .env file.
 * 
 * Usage: node generate-hash.js
 */

const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function generateHash(password) {
  return bcrypt.hash(password, 10);
}

function generateSessionSecret() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

console.log('=== Security Configuration Helper ===\n');
console.log('1. Generate password hash');
console.log('2. Generate session secret');
console.log('3. Exit\n');

rl.question('Select option (1-3): ', (option) => {
  if (option === '1') {
    rl.question('\nEnter password to hash: ', async (password) => {
      if (!password || password.length === 0) {
        console.log('Error: Password cannot be empty');
        rl.close();
        return;
      }
      
      try {
        const hash = await generateHash(password);
        console.log('\n✓ Hash generated successfully!\n');
        console.log('Add this to your .env file:');
        console.log(`ADMIN_PASSWORD_HASH=${hash}`);
        console.log(`\nOr for reports:`);
        console.log(`REPORTS_PASSWORD_HASH=${hash}`);
        console.log('\n⚠️  Keep your .env file secure and never commit it to version control!\n');
        rl.close();
      } catch (error) {
        console.error('Error generating hash:', error.message);
        rl.close();
      }
    });
  } else if (option === '2') {
    const secret = generateSessionSecret();
    console.log('\n✓ Session secret generated!\n');
    console.log('Add this to your .env file:');
    console.log(`SESSION_SECRET=${secret}`);
    console.log('\n⚠️  Keep this secret secure and never commit it to version control!\n');
    rl.close();
  } else if (option === '3') {
    console.log('\nGoodbye!');
    rl.close();
  } else {
    console.log('\nInvalid option. Please select 1, 2, or 3.');
    rl.close();
  }
});
