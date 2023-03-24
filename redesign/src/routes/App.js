import { Component } from "react";
import { withAuth0 } from "@auth0/auth0-react";
import { motion } from "framer-motion";

import Header from "../containers/Header";
import ChatBot from "../containers/ChatBot";
// import DocumentFeed from "../containers/DocumentFeed";
import CodeExplorer from "../containers/CodeExplorer";
import PaymentPlan from "../containers/PaymentPlan";

import { withRouter } from "../library/utilities";
import Mixpanel from "../library/mixpanel";

import "../styles/App.css";

class Message {
  constructor(content, isResponse, isComplete, isPaywalled = false) {
    this.content = content;
    this.isResponse = isResponse;
    this.isComplete = isComplete; // Indicates whether message has finished streaming
    this.isPaywalled = isPaywalled;
  }
}

class Document {
  constructor(content) {
    this.content = content;
  }
}

class CodeChunk {
  constructor(filePath, code, summary) {
    this.filePath = filePath;
    this.code = code;
    this.summary = summary;
  }
}

class StackOverflowPost {
  constructor(title, questionBody, answer, link) {
    this.title = title;
    this.questionBody = questionBody;
    this.answer = answer;
    this.link = link;
  }
}

class App extends Component {
  constructor(props) {
    super(props);

    this.onSubmitQuery = this.onSubmitQuery.bind(this);
    this.onSetCodebaseId = this.onSetCodebaseId.bind(this);
    this.renderSubscriptionModal = this.renderSubscriptionModal.bind(this);
    this.onToggleSubscriptionModal = this.onToggleSubscriptionModal.bind(this);
    this.onGithubAuthentication = this.onGithubAuthentication.bind(this);

    this.state = {
      codebaseId: "",
      messages: [new Message("Ask me anything about your code.", true, true)],
      documents: [],
      subscriptionStatus: {},
      isGithubAuthenticated: false,
      renderSubscriptionModal: false
    };
  }

  /* Event Handlers */

  onGithubAuthentication() {
    const clientId = "fcaf8f61d70e5de447c9";
    // const redirectUri = "https://useadrenaline.com/app";
    const redirectUri = "http://localhost:3000/app";
    // const login = ""; // TODO: Populate this if user is already authenticated with Github
    const scope = "repo";

    let authUrl = "https://github.com/login/oauth/authorize?"
    authUrl += `client_id=${clientId}`;
    authUrl += `&redirect_uri=${redirectUri}`;
    // authUrl += `&login=${login}`;
    authUrl += `&scope=${scope}`;

    const win = window.open(authUrl, "_blank"); // TODO: Open in same tab
    if (win != null) {
      win.focus();
    }
  }

  onToggleSubscriptionModal() {
    const { renderSubscriptionModal } = this.state;
    this.setState({ renderSubscriptionModal: !renderSubscriptionModal });
  }

  onSubmitQuery(message) {
    const { codebaseId, messages } = this.state;
    const {
      isAuthenticated,
      getAccessTokenSilently,
      user
    } = this.props.auth0;

    // TODO: Handle regeneration

    const query = new Message(message, false, true);
    let response = new Message("", true, false);

    if (!isAuthenticated) { // TODO: Display blurred output and prompt user to sign up
      response.content = "You must be signed in to use the chatbot.";
      response.isComplete = true;
    }

    const priorMessages = messages.slice(0, messages.length);
    this.setState({ messages: [...priorMessages, query, response] });

    if (!isAuthenticated) {
      return;
    }

    getAccessTokenSilently()
      .then(token => {
        const request = {
          user_id: user.sub,
          token: token,
          codebase_id: codebaseId,
          query: message
        };
        this.query_ws.send(JSON.stringify(request));
      });
  }

  onSetCodebaseId(codebaseId) {
    this.setState({ codebaseId });
  }

  /* Helpers */

  // TODO: Abstract into its own container component
  renderSubscriptionModal() {
    const { renderSubscriptionModal } = this.state;

    if (!renderSubscriptionModal) {
      return null;
    }

    const dropIn = {
      hidden: {
        y: "-100vh",
        opacity: 0,
      },
      visible: {
        y: "0",
        opacity: 1,
        transition: {
          duration: 0.1,
          type: "spring",
          damping: 25,
          stiffness: 500,
        },
      },
      exit: {
        y: "100vh",
        opacity: 0,
      },
    };

    return (
      <motion.div
        onClick={this.onToggleSubscriptionModal}
        id="modalBackground"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          onClick={(e) => e.stopPropagation()}
          id="subscriptionModal"
          variants={dropIn}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span id="modalTitle">Get answers. Fast.</span>
          <p id="modalSubtitle">Understand your code like an expert. Focus on the problems that matter.</p>

          <div id="paymentPlans">
            <PaymentPlan
              lookupKey="premium"
              planName="PREMIUM"
              price="10"
              features={[
                "100 chat messages.",
                "15 repositories.",
                "50 code snippets."
              ]}
            />
            <div id="spacer" />
            <PaymentPlan
              lookupKey="power"
              planName="POWER"
              price="20"
              features={[
                "Unlimited chat messages.",
                "25 repositories.",
                "Unlimited code snippets."
              ]}
            />
          </div>
        </motion.div>
      </motion.div>
    )
  }

  renderApp() {
    const { subscriptionStatus, messages, codebaseId, isGithubAuthenticated } = this.state;

    if (!subscriptionStatus) {
      return (
        <div id="loadingPage">
          Loading
        </div>
      );
    }

    return (
      <div className="app">
        <Header />

        <div className="body">
          <ChatBot
            messages={messages}
            onSubmitQuery={this.onSubmitQuery}
            onUpgradePlan={this.onToggleSubscriptionModal}
          />
          <CodeExplorer
            onSetCodebaseId={this.onSetCodebaseId}
            codebaseId={codebaseId}
            onUpgradePlan={this.onToggleSubscriptionModal}
            isGithubAuthenticated={isGithubAuthenticated}
            onGithubAuthentication={this.onGithubAuthentication}
          />
        </div>
      </div>
    );
  }

  /* Lifecycle Methods */

  componentDidMount() {
    const { user, isAuthenticated, getAccessTokenSilently } = this.props.auth0;

    if (isAuthenticated) {
      Mixpanel.identify(user.sub);
      Mixpanel.people.set({ email: user.email });
    }

    Mixpanel.track("load_playground");

    // TODO: Only connect to websocket when user is authenticated

    /* Connect to query handler websocket */

    if (window.location.protocol === "https:") {
      // this.query_ws = new WebSocket(`wss://adrenaline-dev.us-east-1.elasticbeanstalk.com/answer_query`);
      this.query_ws = new WebSocket(`wss://localhost:5001/answer_query`);
    } else {
      // this.query_ws = new WebSocket(`wss://adrenaline-dev.us-east-1.elasticbeanstalk.com/answer_query`);
      this.query_ws = new WebSocket(`ws://localhost:5001/answer_query`);

    }

    this.query_ws.onopen = event => { }; // QUESTION: Should we wait to render the rest of the site until connection is established?
    this.query_ws.onmessage = event => {
      const { type, data, is_final, is_paywalled, error_message } = JSON.parse(event.data);
      const { documents, messages } = this.state;

      if (type == "code_chunk") {
        const { chunk, file_path, summary } = data;
        const document = new Document(`\`\`\`\n${chunk}\n\`\`\``); // TODO: Use CodeChunk

        this.setState({ documents: [...documents, document] });
      } else if (type == "answer") {
        const { message } = data;

        const priorMessages = messages.slice(0, messages.length - 1);
        let response = messages[messages.length - 1];

        console.log()

        response.content += message;
        response.isComplete = is_final;
        response.isPaywalled = is_paywalled;

        this.setState({ messages: [...priorMessages, response] });
      } else if (type == "so_post") {
        const { title, question_body, answer, link } = data;
        const document = new Document(answer); // TODO: Use StackOverflowPost

        this.setState({ documents: [...documents, document] });
      }
    }
    this.query_ws.onerror = event => {
      console.log(event); // TODO: Display error message
    };

    if (!isAuthenticated) {
      return;
    }

    /* Handle Github OAuth redirects */

    const { search } = this.props.router.location;

    let githubCode = null;
    if (search != "") {
      const searchParams = search.split("?code=");
      githubCode = searchParams.length == 2 ? searchParams[1] : null;
    }
    githubCode = "52196c2233d300d23e0d";

    console.log(search);

    if (githubCode != null) {
      console.log(githubCode)
      getAccessTokenSilently()
        .then(token => {
          fetch("http://localhost:5000/api/github_callback", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
              user_id: user.sub,
              github_code: githubCode
            })
          })
            .then(res => res.json())
            .then(data => {
              const { is_github_authenticated } = data;
              this.setState({ isGithubAuthenticated: is_github_authenticated });
            })
        })
    }

    /* Fetch user's subscription status */

    getAccessTokenSilently()
      .then(token => {
        fetch("http://localhost:5000/api/user_metadata", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: user.sub,
            email: user.email
          })
        })
          .then(res => res.json())
          .then(data => {
            const {
              plan,
              num_messages_sent,
              num_repositories_indexed,
              num_code_snippets_indexed,
              is_github_authenticated
            } = data;

            this.setState({
              subscriptionStatus: {
                plan,
                numMessagesSent: num_messages_sent,
                numRepositoriesIndexed: num_repositories_indexed,
                numCodeSnippetsIndexed: num_code_snippets_indexed
              },
              isGithubAuthenticated: is_github_authenticated
            });
          });
      });
  }

  render() {
    return (
      <>
        {this.renderSubscriptionModal()}
        {this.renderApp()}
      </>
    );
  }
}

export default withRouter(withAuth0(App));