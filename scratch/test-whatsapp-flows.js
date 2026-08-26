/**
 * Automated WhatsApp Flow Verification Suite for ABU Distance Learning Centre
 * Tests:
 *  1. GET Webhook Handshake Verification (valid vs invalid token)
 *  2. Incomplete Lead Step-by-Step Onboarding (Name -> Email -> Phone with "Same WhatsApp No" confirmation button & text)
 *  3. Returning User Contact Verification at Beginning of Chat (Confirmation Prompt -> Confirm/Change)
 *  4. Detail Update Flow (Name -> Email -> Phone update)
 *  5. ABU Admissions RAG Q&A and Human Escalation Routing
 */

import supabase from '../src/db/supabase.js';
import webhookHandler from '../api/whatsapp/webhook.js';

function createMockReq({ method = 'POST', query = {}, headers = {}, body = {} }) {
  return {
    method,
    query,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body,
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    headersSent: false,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };
}

function createMetaMessagePayload({ from, messageId, text, buttonId, buttonTitle, profileName = 'WhatsApp Inquirer' }) {
  const messageObj = {
    from,
    id: messageId || `wam_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    timestamp: `${Math.floor(Date.now() / 1000)}`,
  };

  if (buttonId) {
    messageObj.type = 'interactive';
    messageObj.interactive = {
      type: 'button_reply',
      button_reply: {
        id: buttonId,
        title: buttonTitle || text || 'Button Click',
      },
    };
  } else {
    messageObj.type = 'text';
    messageObj.text = {
      body: text || '',
    };
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '920478204428865',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '2347025105412',
                phone_number_id: '1220287537833494',
              },
              contacts: [
                {
                  profile: { name: profileName },
                  wa_id: from,
                },
              ],
              messages: [messageObj],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };
}

async function runTests() {
  console.log('========================================================');
  console.log('   STARTING WHATSAPP ABU BOT INTEGRATION TESTS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      failed++;
    }
  }

  // ───────────────────────────────────────────────────────────
  // TEST 1: GET Webhook Handshake Verification
  // ───────────────────────────────────────────────────────────
  console.log('--- TEST 1: GET Verification Handshake ---');
  const verifyReq = createMockReq({
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': process.env.WHATSAPP_VERIFY_TOKEN || 'edutech_abudlc_2026',
      'hub.challenge': 'CHALLENGE_ACCEPTED_12345',
    },
  });
  const verifyRes = createMockRes();
  await webhookHandler(verifyReq, verifyRes);

  assert(verifyRes.statusCode === 200 && verifyRes.body === 'CHALLENGE_ACCEPTED_12345', 'GET Handshake with valid token returns 200 & challenge');

  const invalidReq = createMockReq({
    method: 'GET',
    query: {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'CHALLENGE_SHOULD_FAIL',
    },
  });
  const invalidRes = createMockRes();
  await webhookHandler(invalidReq, invalidRes);

  assert(invalidRes.statusCode === 403, 'GET Handshake with invalid token returns 403 Forbidden');

  // ───────────────────────────────────────────────────────────
  // TEST 2: Incomplete Lead Onboarding Flow
  // ───────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: New Incomplete User Onboarding Flow ---');
  const testPhone = `2348099${Math.floor(100000 + Math.random() * 900000)}`;

  // Clean up any pre-existing test data for this test phone
  await supabase.from('conversations').delete().eq('whatsapp_phone', testPhone);
  await supabase.from('leads').delete().eq('session_id', `wa_${testPhone}`);

  // Step 2.1: Initial Greeting
  const step1Req = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Hello' }),
  });
  const step1Res = createMockRes();
  await webhookHandler(step1Req, step1Res);
  assert(step1Res.body?.status === 'asked_name', 'Step 2.1: Asks for Full Name on new contact');

  // Step 2.2: User provides Name
  const step2Req = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Musa Danladi' }),
  });
  const step2Res = createMockRes();
  await webhookHandler(step2Req, step2Res);
  assert(step2Res.body?.status === 'asked_email', 'Step 2.2: Saves Name and asks for Email');

  // Step 2.3: User provides invalid email
  const step3Req = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'notanemail' }),
  });
  const step3Res = createMockRes();
  await webhookHandler(step3Req, step3Res);
  assert(step3Res.body?.status === 'asked_email', 'Step 2.3: Rejects invalid email and prompts again');

  // Step 2.4: User provides valid email
  const step4Req = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'musa.danladi@example.com' }),
  });
  const step4Res = createMockRes();
  await webhookHandler(step4Req, step4Res);
  assert(step4Res.body?.status === 'asked_phone', 'Step 2.4: Saves Email and asks for Phone (with WhatsApp No confirmation button)');

  // Step 2.5: User confirms phone with "Use WhatsApp No" button
  const step5Req = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Use WhatsApp No', buttonId: 'phone_use_current' }),
  });
  const step5Res = createMockRes();
  await webhookHandler(step5Req, step5Res);
  assert(step5Res.body?.status === 'onboarding_completed', 'Step 2.5: Confirms current WhatsApp phone, completes onboarding, activates conversation');

  // Verify in Supabase
  const { data: dbLead } = await supabase.from('leads').select('*').eq('session_id', `wa_${testPhone}`).single();
  assert(dbLead && dbLead.name === 'Musa Danladi' && dbLead.email === 'musa.danladi@example.com', 'Database lead record has correct Name and Email');
  assert(dbLead && ((dbLead.phone && dbLead.phone.includes(testPhone)) || (dbLead.normalized_phone && dbLead.normalized_phone.includes(testPhone))), 'Database lead record has correct normalized phone');

  // Verify ABU school binding
  const { data: abuSchool } = await supabase.from('schools').select('id, slug').eq('slug', 'abu').single();
  assert(dbLead && dbLead.school_id === abuSchool.id, 'Lead is strictly associated with ABU school_id');

  // ───────────────────────────────────────────────────────────
  // TEST 3: Returning User Confirmation Flow
  // ───────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Returning User Confirmation Flow ---');
  // Trigger a new session start with "hi"
  const startReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Hi' }),
  });
  const startRes = createMockRes();
  await webhookHandler(startReq, startRes);
  assert(startRes.body?.status === 'confirmation_prompt_sent', 'Step 3.1: Prompts returning user to confirm contact details (Name, Email, Phone)');

  // Confirm with '1' or confirm_details button
  const confirmReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Confirm & Proceed', buttonId: 'confirm_details' }),
  });
  const confirmRes = createMockRes();
  await webhookHandler(confirmReq, confirmRes);
  assert(confirmRes.body?.status === 'confirmed_and_activated', 'Step 3.2: User confirms details with button/1 -> transitions to active');

  // ───────────────────────────────────────────────────────────
  // TEST 4: Returning User Update/Change Details Flow
  // ───────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Returning User Detail Update Flow ---');
  // Trigger session start again
  const startUpdateReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Restart' }),
  });
  const startUpdateRes = createMockRes();
  await webhookHandler(startUpdateReq, startUpdateRes);
  assert(startUpdateRes.body?.status === 'confirmation_prompt_sent', 'Step 4.1: Sent confirmation prompt on restart');

  // User chooses '2' or 'Change Details'
  const changeReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Change Details', buttonId: 'change_details' }),
  });
  const changeRes = createMockRes();
  await webhookHandler(changeReq, changeRes);
  assert(changeRes.body?.status === 'change_flow_started', 'Step 4.2: Enters change details flow');

  // User sends new name
  const newNameReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Musa Abubakar Danladi' }),
  });
  const newNameRes = createMockRes();
  await webhookHandler(newNameReq, newNameRes);
  assert(newNameRes.body?.status === 'updated_name', 'Step 4.3: Updates Name and asks for Email');

  // User says 'Keep' for email
  const keepEmailReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Keep' }),
  });
  const keepEmailRes = createMockRes();
  await webhookHandler(keepEmailReq, keepEmailRes);
  assert(keepEmailRes.body?.status === 'updated_email', 'Step 4.4: Keeps existing email and asks for Phone');

  // User updates phone
  const updatePhoneReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: '08031122334' }),
  });
  const updatePhoneRes = createMockRes();
  await webhookHandler(updatePhoneReq, updatePhoneRes);
  assert(updatePhoneRes.body?.status === 'update_completed', 'Step 4.5: Updates Phone and activates conversation');

  const { data: updatedLead } = await supabase.from('leads').select('*').eq('session_id', `wa_${testPhone}`).single();
  assert(updatedLead && updatedLead.name === 'Musa Abubakar Danladi', 'Database updated with new Name');
  assert(updatedLead && updatedLead.email === 'musa.danladi@example.com', 'Database retained kept Email');
  assert(updatedLead && updatedLead.normalized_phone === '+2348031122334', 'Database updated with new normalized phone');

  // ───────────────────────────────────────────────────────────
  // TEST 5: Active Stage RAG & Escalation
  // ───────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Active ABU Admissions Q&A & Escalation ---');

  // RAG Query
  const ragReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'What is ABU Distance Learning Centre?' }),
  });
  const ragRes = createMockRes();
  await webhookHandler(ragReq, ragRes);
  assert(ragRes.body?.status === 'success' || ragRes.body?.status === 'answered_and_escalated', 'Step 5.1: Successfully queried ABU Knowledge Base');

  // Human Escalation Request
  const escReq = createMockReq({
    method: 'POST',
    body: createMetaMessagePayload({ from: testPhone, text: 'Please transfer me to a human support agent' }),
  });
  const escRes = createMockRes();
  await webhookHandler(escReq, escRes);
  assert(escRes.body?.status === 'escalated' || escRes.body?.status === 'escalated_message_logged', 'Step 5.2: Detects human escalation request and transitions to escalated stage');

  // Clean up test records
  await supabase.from('escalations').delete().eq('lead_id', updatedLead.id);
  await supabase.from('conversations').delete().eq('whatsapp_phone', testPhone);
  await supabase.from('leads').delete().eq('session_id', `wa_${testPhone}`);

  console.log('\n========================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
