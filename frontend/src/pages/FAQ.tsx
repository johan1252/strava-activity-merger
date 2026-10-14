import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { usePageMeta } from '../utils/pageMeta';

const TRAINING_FAQ: { question: string; answer: string }[] = [
    {
        question: 'What is a training plan?',
        answer: 'A training plan is a week-by-week schedule that takes you from where you are now to race day. Pick a race distance (5K, 10K, half marathon or marathon), a race date up to 52 weeks away and a target finish time, and Streven builds a plan from your Strava history. Each plan also shows a realism score (how achievable your target looks) and a difficulty score (how much it asks of you compared with your recent training).',
    },
    {
        question: 'How do I change my training plan?',
        answer: 'Use the chat next to your plan (the chat button on a phone) and say what you want in plain words, for example "I only want to run 3 times a week", "add a swim on Tuesdays", "add a weights session each week", "show the day of the week for each session" or "I\'m on holiday 1-14 November, only 1-2 runs those weeks". Weeks that are already over are not changed, and sessions you have ticked stay ticked unless your change affects them.',
    },
    {
        question: 'Can I add swimming, cycling or weight training?',
        answer: 'Yes. Ask the chat to add swims, rides, weights, yoga or walks. They appear as sessions in your plan next to your runs, and Strava activities of that type tick them off automatically.',
    },
    {
        question: 'Can I change my race date, distance or target time?',
        answer: 'Yes, through the chat. The coach first repeats the new goal and asks you to confirm. Confirming rebuilds the plan from scratch, so sessions you have ticked are reset, but the coach re-applies what you asked for earlier, such as run days, cross-training or a holiday.',
    },
    {
        question: 'How are sessions marked as done?',
        answer: 'Automatically, when a matching Strava activity appears in that week: a run counts if it covers at least 95% of the planned distance, and a time-based session such as weights counts if it lasts at least 80% of the planned time. You can also tick or untick any session yourself.',
    },
    {
        question: 'How many training plans can I have?',
        answer: 'Up to five. Delete a plan from the plan list to make room for a new one. Streven needs to finish importing your Strava history before it can build your first plan.',
    },
    {
        question: 'Are there limits on the chat and plan building?',
        answer: 'Yes, to keep the service running for everyone: up to 50 chat messages and 10 plan builds per day. The limits reset at midnight UTC.',
    },
    {
        question: 'Is the training plan medical or professional coaching advice?',
        answer: 'No. Plans and chat replies are written by an AI model and are suggestions only. Check with a doctor or a qualified coach before changing your training, and stop if something hurts.',
    },
];

const CORE_FAQ: { question: string; answer: string }[] = [
    {
        question: 'What is Streven?',
        answer: 'Streven is a set of tools for Strava athletes. You can combine two activities, round an activity\'s distance up or down and re-upload the corrected activity, see your training stats, and build a training plan for your next race.',
    },
    {
        question: 'How do I combine two activities?',
        answer: 'Open the actions menu on one of the activities, choose the second activity and press Combine. Streven creates and uploads a merged activity for you to review. You can combine a maximum of two activities at once, and both must have the same sport type in Strava.',
    },
    {
        question: 'How does rounding distance work?',
        answer: 'Rounding down removes the last metres of an activity, which adjusts pace and time. Rounding up adds metres at the pace of the last recorded kilometre. Both create a new activity with the distance you choose, and only work on activities longer than 1 km.',
    },
    {
        question: 'Why does Streven not update my existing activity?',
        answer: 'Strava\'s terms do not allow third-party apps to modify existing activity data, so Streven creates a new activity and leaves your original untouched.',
    },
];

const FAQ_JSON_LD = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [...CORE_FAQ, ...TRAINING_FAQ].map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
};

const FAQ: React.FC = () => {
    usePageMeta({
        title: 'FAQ: Strava activity tools and training plans | Streven',
        description: 'Answers about combining Strava activities, rounding distance, and building and changing a race training plan with Streven.',
        path: '/faq',
        jsonLd: FAQ_JSON_LD,
    });

    return (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw', justifyContent: 'space-between' }}>
        <Header />
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h1>Frequently Asked Questions</h1>
            <br />

            <h2>What is Streven?</h2>
            <p>Streven is a small collection of tools for Strava athletes. You can correct or adjust your activities — for example combining two activity parts or rounding activity distance up or down and re-uploading the corrected activity to Strava — and you can build a training plan for your next race.</p>
            <p>"Streven" is Dutch for "to strive".</p>

            <h2>How do I combine two activities?</h2>
            <p>Combining activities allows you to merge two independent Strava activities that we're intended to be together. Example, you may have stopped your activity accidentally, or had break before carrying on with your activity.</p>
            <p>Open the actions menu on one of the activities you want to combine, follow the prompts and select the second activity followed by the "Combine" button. Streven will create and upload a merged activity for you to review.</p>
            <p>At this time you can only combine a <b>maximum of two activities at once</b>.</p>
            <p>Activities can only be combined if they are the same <b>sport type</b> in Strava (example - both activities are a "Run"). Sport types can be adjusted in Strava if necessary.</p>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
                <figure style={{ maxWidth: 820, textAlign: 'center' }}>
                    <img src="/assets/combine-example.svg" alt="Combine two activities illustration" style={{ width: '100%', height: 'auto', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }} />
                    <figcaption style={{ marginTop: 8, fontSize: 13, color: '#666' }}>Left: Activity 1 and Activity 2 shown separately. Right: the combined activity created by Streven.</figcaption>
                </figure>
            </div>

            <h2>How does rounding distance work?</h2>
            <p>The round up/down tools recreate an activity with the adjusted distance you specify. This is useful when GPS noise slightly alters your recorded distance and you want your records to reflect the intended rounded value.</p>
            <p>Rounding actions can only be performed on activities <b>greater than 1km</b> in length.</p>

            <p>When an activity is <b>rounded down</b>, the last X metres of the activity will be removed. This will automatically adjust your pace, elapsed time, and other statistics as if you had only run that updated distance.</p>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
                <figure style={{ maxWidth: 820, textAlign: 'center' }}>
                    <img src="/assets/rounded-example-down.svg" alt="Before and after rounded down activity illustration" style={{ width: '100%', height: 'auto', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }} />
                    <figcaption style={{ marginTop: 8, fontSize: 13, color: '#666' }}>Left: recorded activity (full). Right: recreated activity after rounding down — the last metres are removed.</figcaption>
                </figure>
            </div>

            <p>When an activity is <b>rounded up</b>, additional metres are added using the average pace of the <b>last recorded kilometer</b>.</p>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center' }}>
                <figure style={{ maxWidth: 820, textAlign: 'center' }}>
                    <img src="/assets/rounded-example.svg" alt="Before and after rounded activity illustration" style={{ width: '100%', height: 'auto', borderRadius: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }} />
                    <figcaption style={{ marginTop: 8, fontSize: 13, color: '#666' }}>Left: recorded activity with missing last metres. Right: recreated activity after rounding up — extra metres appended at the last kilometre's average pace.</figcaption>
                </figure>
            </div>
            <p>Note - Your <b>activity map will remain identical</b> after rounding up action, as no GPS points are changed or added. Distance is simply adjusted in the activity metadata.</p>

            <h2>Why does Streven not update my existing activity?</h2>
            <p>Strava's terms of use does not allow third party integrations to modify existing activity data.</p>
            <p>Streven creates a new activity, keeping your existing activities intact in case you need to refer to them or want them as a backup.</p>
            <p>We recommend you set the visibility of source activities to "Only Me" or delete source activities after using Streven to update an activity.</p>

            <h2>How do I keep my activities hidden before they are combined?</h2>
            <p>We recommend setting your Strava <b>default activity privacy control</b> to <b>"Only Me"</b>. <br />This ensures all new activities are hidden from followers until you approve them. See <a href='https://support.strava.com/hc/en-us/articles/216919377-Activity-Privacy-Controls' style={{ color: '#007bff', textDecoration: 'underline' }}>Activity Privacy Controls</a> page for more details.</p>

            <h2>Training plans</h2>
            {TRAINING_FAQ.map(({ question, answer }) => (
                <div key={question}>
                    <h3>{question}</h3>
                    <p>{answer}</p>
                </div>
            ))}

            <h2>I still have questions</h2>
            <p>If you still have questions, please email us at <a href="mailto:support@streventools.com" style={{ color: '#007bff', textDecoration: 'underline' }}>support@streventools.com</a> and we'll get back to you.</p>
        </div>
        <Footer />
    </div>
    );
};

export default FAQ;
