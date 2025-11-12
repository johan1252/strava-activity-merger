import React from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';

const FAQ: React.FC = () => (
    <div className="App" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', maxWidth: '100vw', justifyContent: 'space-between' }}>
        <Header />
        <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
            <h1>Frequently Asked Questions</h1>
            <br />

            <h2>What is Streven?</h2>
            <p>Streven is a small collection of tools to help correct or adjust your Strava activities — for example combining two activity parts or rounding activity distance up or down and re-uploading the corrected activity to Strava.</p>
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

            <h2>I still have questions</h2>
            <p>If you still have questions, please email us at <a href="mailto:support@streventools.com" style={{ color: '#007bff', textDecoration: 'underline' }}>support@streventools.com</a> and we'll get back to you.</p>
        </div>
        <Footer />
    </div>
);

export default FAQ;
