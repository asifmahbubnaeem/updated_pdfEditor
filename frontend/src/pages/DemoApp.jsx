import React from 'react';
import Page from '../components/Page';
import '../styles/App.css'; // General app styles

function DemoApp() {
  const page1Content = "This is the content for Page 1";
  const page2Content = "This is the content for Page 2.";
  const page3Content = "This is the content for Page 3.";

  const page4 =  (<div style={{backgroundColor: 'red', padding: '10px'}}>
    <p>this is a paragraph</p><input type="file"/>
    <canvas className="border rounded shadow" style={{marginTop: '5px',border: '1px solid black'}}/>
  </div>);

  return (
    <div className="app-container">
      <Page pageContent={page1Content} />
      <Page pageContent={page2Content} />
      <Page pageContent={page3Content} />
      <Page pageContent={page4} />
    </div>
  );
}

export default DemoApp;